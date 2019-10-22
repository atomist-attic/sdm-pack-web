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
    CodeInspection,
    CodeInspectionRegistration,
    LoggingProgressLog,
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
                let contentType: string;
                if (f.path.endsWith(".svg")) {
                    contentType = "image/svg+xml";
                } else if (f.path.endsWith(".css")) {
                    contentType = "text/css";
                } else {
                    contentType = "text/html";
                }
                const result = await hv({
                    data: content,
                    format: "json",
                    headers: {
                        "Content-Type": contentType,
                    },
                } as any); // https://github.com/DefinitelyTyped/DefinitelyTyped/pull/39313
                log.write(`Results from ${f.path}:${htmlValidatorMessagesToString(result.messages)}`);
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
 * Provide code inspection registration that runs
 * [html-validator](https://www.npmjs.com/package/html-validator),
 * which uses the [Nu Html Checker](https://validator.w3.org/nu/), to
 * validate a generated web site at `sitePath`.
 */
export function htmlValidatorInspection(sitePath: string): CodeInspectionRegistration<ProjectReview, NoParameters> {
    return {
        name: `html-validator-${sitePath}`,
        description: "Run htmltest on website",
        inspection: runHtmlValidator(sitePath),
    };
}

/**
 * Convert html-validator messages to a string suitable to write to
 * the progress log.
 *
 * @param messages html-validator response messages
 * @return String representation of messages
 */
export function htmlValidatorMessagesToString(messages: hv.ValidationMessageObject[]): string {
    if (!messages || messages.length < 1) {
        return " no results";
    }
    const summaries = messages.map(m => {
        const kind = m.subType || m.type;
        let position: string = "";
        if (m.lastLine) {
            position += m.lastLine.toString(10);
        }
        if (m.lastColumn) {
            position += ":" + m.lastColumn.toString(10);
        }
        if (position) {
            position = `[${position}] `;
        }
        return `${position}${kind}: ${m.message}`;
    });
    if (summaries.length === 1) {
        return " " + summaries[0];
    } else {
        return "\n" + summaries.map(s => "  " + s).join("\n");
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
    const subcategory = (src.endsWith(".css")) ? "css" : ((src.endsWith(".svg")) ? "svg" : "html");
    return messages.filter(m => m.type !== "info").map(m => {
        return {
            category: "html-validator",
            detail: m.message,
            severity: (m.subType === "warning") ? "warn" : "error",
            sourceLocation: {
                path: src,
                columnFrom1: m.lastColumn,
                lineFrom1: m.lastLine,
                offset: m.hiliteStart,
            },
            subcategory,
        };
    });
}
