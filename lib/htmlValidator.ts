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
    Project,
    ProjectReview,
    projectUtils,
    ReviewComment,
    Severity,
    SourceLocation,
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
 * Function that maps the path to a file in the site directory to the
 * path to a file in the source directory.
 */
export type SiteLocationToSourceLocation = (s: SourceLocation, p: Project) => Promise<SourceLocation>;
export const noOpSiteToSource: SiteLocationToSourceLocation = async s => s;

/** [[runHtmlValidator]] arguments. */
export interface RunHtmlValidatorOptions {
    /** Path to the website relative to the root of the project. */
    sitePath: string;
    /** Function that maps a site file location to a source file location in the project. */
    siteToSource?: SiteLocationToSourceLocation;
}

/**
 * Run html-validator on the site convert results to ReviewComments.
 *
 * @param arg Object providing location of site and other details
 * @return function that takes a project and returns ReviewComments
 */
export function runHtmlValidator(arg: RunHtmlValidatorOptions): CodeInspection<ProjectReview, NoParameters> {
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
        if (!await p.hasDirectory(arg.sitePath)) {
            const msg = `Project ${slug} does not have site directory '${arg.sitePath}'`;
            logger.warn(msg);
            log.write(msg);
            return review;
        }
        const absPath = path.join(p.baseDir, arg.sitePath);
        log.write(`Running html-validator on ${slug} at '${absPath}'`);
        try {
            await projectUtils.doWithFiles(p, `${arg.sitePath}/**/*.{html,css,svg}`, async f => {
                try {
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
                    const siteToSource = arg.siteToSource || noOpSiteToSource;
                    const convertArgs = { messages: result.messages, path: f.path, project: p, siteToSource };
                    const comments = await htmlValidatorMessagesToReviewComments(convertArgs);
                    review.comments.push(...comments);
                } catch (e) {
                    const msg = `Failed to run html-validator on '${slug}/${arg.sitePath}/${f.path}': ${e.message}`;
                    logger.error(msg);
                    log.write(msg);
                }
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
export function htmlValidatorAutoInspection(arg: RunHtmlValidatorOptions, pushTest?: PushTest): AutoInspectRegistration<ProjectReview, NoParameters> {
    return {
        name: DefaultGoalNameGenerator.generateName(`html-validator-${arg.sitePath}-auto-inspection`),
        inspection: runHtmlValidator(arg),
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

/** [[htmlValidatorMessagesToReviewComments]] arguments. */
export interface HtmlValidatorMessagesToReviewCommentsArgs {
    /** html-validator response messages for path. */
    messages: hv.ValidationMessageObject[];
    /** Path to the site file relative to the root of the project. */
    path: string;
    /** Project of website. */
    project: Project;
    /** Mapping from site location to source location. */
    siteToSource: SiteLocationToSourceLocation;
}

/**
 * Convert html-validator messages to review comments.
 *
 * @param src File with which the messages are associated
 * @param messages html-validator response messages
 * @return Code inspection review comments
 */
export async function htmlValidatorMessagesToReviewComments(arg: HtmlValidatorMessagesToReviewCommentsArgs): Promise<ReviewComment[]> {
    if (!arg.messages || arg.messages.length < 1) {
        return [];
    }
    const subcategory = (arg.path.endsWith(".css")) ? "css" : ((arg.path.endsWith(".svg")) ? "svg" : "html");
    return Promise.all(arg.messages.filter(hvFilter).map(async m => {
        const sourceLocation = await arg.siteToSource(createSourceLocation(arg.path, m), arg.project);
        return {
            category: "html-validator",
            detail: m.message,
            severity: ((m.subType === "warning") ? "warn" : "error") as Severity,
            sourceLocation,
            subcategory,
        };
    }));
}

/**
 * Return false if HTML validator message is not considered an issue.
 * This function filters returns false for non-warning info message
 * and parse errors.  Otherwise, it returns true.  Use to filter out
 * info messages that do not require action.
 *
 * @param m Message to test
 * @return false if validator message is not actionable
 */
function hvFilter(m: hv.ValidationMessageObject): boolean {
    if (m.type === "info") {
        if (m.subType === "warning") {
            return true;
        } else {
            return false;
        }
    } else if (m.message === "Parse Error.") {
        return false;
    } else {
        return true;
    }
}

/**
 * Create SourceLocation object from source file path and
 * html-validator message.  html-validator does not provide a true
 * offset, so we use the hilite offset within the extract as that
 * value.
 *
 * @param src Path to source file relative to project root
 * @param message html-validator response message
 * @return SourceLocation object
 */
function createSourceLocation(src: string, message: hv.ValidationMessageObject): SourceLocation {
    const sourceLocation = {
        path: src,
        offset: 0,
        columnFrom1: 0,
        lineFrom1: 0,
    };
    if (hasLocation(message)) {
        sourceLocation.columnFrom1 = message.lastColumn;
        sourceLocation.lineFrom1 = message.lastLine;
        sourceLocation.offset = message.hiliteStart;
    }
    return sourceLocation;
}

/**
 * Test if message has location properties.
 */
function hasLocation(m: hv.ValidationMessageObject): m is hv.ValidationMessageLocationObject {
    return !!(m as hv.ValidationMessageLocationObject).extract;
}
