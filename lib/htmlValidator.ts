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
    isLocalProject,
    logger,
    NoParameters,
    ProjectReview,
    projectUtils,
    ReviewComment,
} from "@atomist/automation-client";
import {
    AutoInspectRegistration,
    CodeInspection,
    DefaultGoalNameGenerator,
    LoggingProgressLog,
    PushTest,
} from "@atomist/sdm";
import * as hv from "html-validator";
import * as path from "path";

/**
 * Run html-validator on `sitePath` and convert results to ReviewComments.
 *
 * @param sitePath path to web site relative to root of project
 * @return function that takes a project and returns ReviewComments
 */
export function runHtmlValidator(sitePath: string): CodeInspection<ProjectReview, NoParameters> {
    return async (p, papi) => {
        const slug = `${p.id.owner}/${p.id.repo}`;
        const log = papi.progressLog || new LoggingProgressLog("html-validator");
        const review: ProjectReview = { repoId: p.id, comments: [] };
        if (!isLocalProject(p)) {
            const msg = `Project ${slug} is not a local project`;
            logger.error(msg);
            log.write(msg);
            return review;
        }
        if (!await p.hasDirectory(sitePath)) {
            const msg = `Project ${slug} does not have site directory '${sitePath}'`;
            logger.warn(msg);
            log.write(msg);
            return review;
        }
        const absPath = path.join(p.baseDir, sitePath);
        log.write(`Running html-validator on ${slug} at '${absPath}'`);
        try {
            await projectUtils.doWithFiles(p, `${sitePath}/**/*.{html,css,svg}`, async f => {
                log.write(`Processing ${f.path}...`);
                const content = await f.getContent();
                if (!content) {
                    log.write(`No content in ${f.path}`);
                    return;
                }
                const contentType = mimeType(f.path);
                const result = await hv({
                    data: content,
                    format: "json",
                    headers: {
                        "Content-Type": contentType,
                    },
                });
                const comments = htmlValidatorMessagesToReviewComments(f.path, result.messages);
                review.comments.push(...comments);
            });
        } catch (e) {
            const msg = `Failed to run html-validator on ${slug} at '${absPath}': ${e.message}`;
            logger.error(msg);
            log.write(msg);
        }
        return review;
    };
}

/**
 * Provide auto inspection registration that runs
 * [html-validator](https://www.npmjs.com/package/html-validator),
 * which uses the [Nu Html Checker](https://validator.w3.org/nu/), to
 * validate a generated web site at `sitePath`.
 */
export function htmlValidatorAutoInspection(sitePath: string, pushTest?: PushTest): AutoInspectRegistration<ProjectReview, NoParameters> {
    return {
        name: DefaultGoalNameGenerator.generateName(`html-validator-${sitePath}-auto-inspection`),
        inspection: runHtmlValidator(sitePath),
        pushTest,
    };
}

/**
 * Determine and return MIME type for provided file path.
 *
 * @param filePath file name including extension
 */
function mimeType(filePath: string): "image/svg+xml" | "text/css" | "text/html" {
    if (filePath.endsWith(".svg")) {
        return "image/svg+xml";
    } else if (filePath.endsWith(".css")) {
        return "text/css";
    } else {
        return "text/html";
    }
}

/**
 * Convert html-validator messages to review comments.
 *
 * @param src File with which the messages are associated
 * @param messages html-validator response messages
 * @return Code inspection review comments
 */
export function htmlValidatorMessagesToReviewComments(src: string, messages: hv.ValidationMessageObject[]): ReviewComment[] {
    if (!messages || messages.length < 1) {
        return [];
    }
    const subcategory = (src.endsWith(".css")) ? "css" : ((src.endsWith(".svg")) ? "svg" : "html");
    return messages.filter(infoFilter).map(m => {
        const sourceLocation = {
            path: src,
            offset: 0,
            columnFrom1: 0,
            lineFrom1: 0,
        };
        if (hasLocation(m)) {
            sourceLocation.columnFrom1 = m.lastColumn;
            sourceLocation.lineFrom1 = m.lastLine;
            sourceLocation.offset = m.hiliteStart; // technically not correct
        }
        return {
            category: "html-validator",
            detail: m.message,
            severity: (m.subType === "warning") ? "warn" : "error",
            sourceLocation,
            subcategory,
        };
    });
}

/**
 * Return false if messages is a non-warning info message, true
 * otherwise.  Use to filter out info messages that are not warnings.
 *
 * @param m Message to test
 */
function infoFilter(m: hv.ValidationMessageObject): boolean {
    if (m.type === "info") {
        if (m.subType === "warning") {
            return true;
        } else {
            return false;
        }
    } else {
        return true;
    }
}

/**
 * Test if message has location properties.
 */
function hasLocation(m: hv.ValidationMessageObject): boolean {
    return !!m.extract;
}
/*
function hasLocation(m: hv.ValidationMessageObject): m is hv.ValidationMessageLocationObject {
    return !!(m as hv.ValidationMessageLocationObject).extract;
}
*/
