/*
 * Copyright © 2019 Atomist, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {
    HttpClientOptions,
    HttpResponse,
    logger,
} from "@atomist/automation-client";
import {
    DefaultGoalNameGenerator,
    ExecuteGoal,
    ExecuteGoalResult,
    FulfillableGoalDetails,
    FulfillableGoalWithRegistrations,
    getGoalDefinitionFrom,
    Goal,
    GoalInvocation,
    ImplementationRegistration,
    ProgressLog,
} from "@atomist/sdm";

/**
 * Register a URL to fetch.
 */
export interface FetchRegistration extends Partial<ImplementationRegistration> {
    /** URL to fetch. */
    url: string;
    /**
     * HTTP client options to use when fetching.  They are passed to
     * the underlying client implementation unchanged.
     */
    httpClientOptions?: HttpClientOptions;
    /**
     * Function passed contents of web page to verify its contents.
     * If not provided, any request that returns a response code in
     * the range [200,300) is considered successfully verified.  Note
     * that many HTTP client implementations with throw errors if the
     * response code is not within the 200s, so it may not be possible
     * to test for responses outside that range.
     */
    verify?: (r: HttpResponse<string>) => Promise<boolean>;
}

/**
 * Goal that fetches a web page.
 */
export class Fetch extends FulfillableGoalWithRegistrations<FetchRegistration> {

    constructor(goalDetailsOrUniqueName: FulfillableGoalDetails | string = DefaultGoalNameGenerator.generateName("fetch"), ...dependsOn: Goal[]) {
        super({
            workingDescription: "Fetching URL",
            completedDescription: "Fetched URL",
            ...getGoalDefinitionFrom(goalDetailsOrUniqueName, DefaultGoalNameGenerator.generateName("fetch")),
            displayName: "fetch",
        }, ...dependsOn);
    }

    public with(registration: FetchRegistration): this {
        this.addFulfillment({
            goalExecutor: executeFetch(registration),
            name: DefaultGoalNameGenerator.generateName("fetcher"),
            ...registration as ImplementationRegistration,
        });
        return this;
    }
}

/**
 * Return a goal executor that performs the fetch operation in
 * accordance with the provided registration.
 */
export function executeFetch(reg: FetchRegistration): ExecuteGoal {
    return async (goalInvocation: GoalInvocation): Promise<ExecuteGoalResult> => {
        const log = goalInvocation.progressLog;
        if (!goalInvocation.configuration.http || !goalInvocation.configuration.http.client || !goalInvocation.configuration.http.client.factory) {
            return logResult(fetchResult(1, `SDM client configuration does not have an HTTP client factory`, reg.url), log);
        }
        const httpClient = goalInvocation.configuration.http.client.factory.create();
        let result: HttpResponse<string>;
        try {
            result = await httpClient.exchange(reg.url, reg.httpClientOptions);
        } catch (e) {
            return logResult(fetchResult(1, `Failed to fetch '${reg.url}': ${e.message}`, reg.url), log);
        }
        const verify = reg.verify || defaultFetchVerify;
        let verified: boolean;
        try {
            verified = await verify(result);
        } catch (e) {
            return logResult(fetchResult(1, `Failed to execute verify function on result from '${reg.url}': ${e.message}`, reg.url), log);
        }
        if (verified) {
            return logResult(fetchResult(0, `Successfully fetched and verified '${reg.url}'`, reg.url), log);
        } else {
            return logResult(fetchResult(1, `Successfully fetched but verification failed for '${reg.url}'`, reg.url), log);
        }
    };
}

/** Create an execute goal result with the code, message, and external URL. */
function fetchResult(code: number, message: string, url: string): ExecuteGoalResult {
    return {
        code,
        message,
        externalUrls: [{ label: url, url }],
    };
}

/** Log the result and return it. */
function logResult(egr: ExecuteGoalResult, log: ProgressLog): ExecuteGoalResult {
    if (egr.message) {
        const l = (egr.code) ? logger.error : logger.info;
        l(egr.message);
        log.write(egr.message);
    }
    return egr;
}

/**
 * Return true if response status is within the range [200,300).
 */
async function defaultFetchVerify(response: HttpResponse<string>): Promise<boolean> {
    return response.status <= 200 && response.status < 300;
}
