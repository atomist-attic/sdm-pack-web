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
    DefaultHttpClientFactory,
    HttpResponse,
} from "@atomist/automation-client";
import { ExecuteGoalResult } from "@atomist/sdm";
import * as assert from "power-assert";
import { executeFetch } from "../lib/fetch";

describe("fetch", () => {

    describe("executeFetch", () => {

        it("fetches and verifies a well-known URL", async () => {
            const r = { url: "https://github.com/" };
            const f = executeFetch(r);
            const g: any = {
                configuration: {
                    http: {
                        client: {
                            factory: DefaultHttpClientFactory,
                        },
                    },
                },
                progressLog: {
                    write: () => { },
                },
            };
            const p = await f(g);
            assert(p);
            const x = p as ExecuteGoalResult;
            assert(x.code === 0);
            assert(x.message === "Successfully fetched and verified 'https://github.com/'");
        }).timeout(5000);

        it("fails on a URL that does not exist", async () => {
            const r = {
                url: "https://github.com/~SDLK/ajsdflj/Lkjoipmnb",
                httpClientOptions: {
                    retry: {
                        retries: 0,
                    },
                },
            };
            const f = executeFetch(r);
            const g: any = {
                configuration: {
                    http: {
                        client: {
                            factory: DefaultHttpClientFactory,
                        },
                    },
                },
                progressLog: {
                    write: () => { },
                },
            };
            const p = await f(g);
            assert(p);
            const x = p as ExecuteGoalResult;
            assert(x.code === 1);
            assert(x.message);
            assert((x.message as string).startsWith("Failed to fetch 'https://github.com/~SDLK/ajsdflj/Lkjoipmnb': "));
        }).timeout(5000);

        it("uses custom verify function", async () => {
            let verified = false;
            const r = {
                url: "https://github.com/atomist/sdm-pack-web",
                httpClientOptions: {
                    retry: {
                        retries: 0,
                    },
                },
                verify: async (hr: HttpResponse<string>) => {
                    verified = true;
                    return !!hr.body && hr.body.includes("@atomist/sdm-pack-web");
                },
            };
            const f = executeFetch(r);
            const g: any = {
                configuration: {
                    http: {
                        client: {
                            factory: DefaultHttpClientFactory,
                        },
                    },
                },
                progressLog: {
                    write: () => { },
                },
            };
            const p = await f(g);
            assert(p);
            const x = p as ExecuteGoalResult;
            assert(verified, "failed to use custom verifier");
            assert(x.code === 0);
            assert(x.message === "Successfully fetched and verified 'https://github.com/atomist/sdm-pack-web'");
        }).timeout(5000);

    });

});
