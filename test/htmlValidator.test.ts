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
    InMemoryProject,
    SourceLocation,
} from "@atomist/automation-client";
import * as assert from "power-assert";
import {
    htmlValidatorMessagesToReviewComments,
    noOpSiteToSource,
} from "../lib/htmlValidator";

describe("htmlValidator", () => {

    describe("htmlValidatorMessagesToReviewComments", () => {

        it("returns no comments when given no messages", async () => {
            for (const m of [undefined, []] as any[]) {
                const p = InMemoryProject.of();
                const a = { path: "chuck.html", project: p, siteToSource: noOpSiteToSource, messages: m };
                const c = await htmlValidatorMessagesToReviewComments(a);
                assert(c.length === 0);
            }
        });

        it("filters out non-warning info messages", async () => {
            const p = InMemoryProject.of();
            const m: any[] = [
                { type: "info", message: "what?" },
                { type: "info", subType: "warning", message: "huh?", extract: "x", hiliteStart: 8, lastColumn: 7, lastLine: 6 },
                { type: "info", message: "no?", extract: "x", hiliteStart: 2, lastColumn: 2, lastLine: 2 },
            ];
            const a = { path: "chuck.html", project: p, siteToSource: noOpSiteToSource, messages: m };
            const c = await htmlValidatorMessagesToReviewComments(a);
            const e = [
                {
                    category: "html-validator",
                    detail: "huh?",
                    severity: "warn",
                    sourceLocation: { path: "chuck.html", offset: 8, columnFrom1: 7, lineFrom1: 6 },
                    subcategory: "html",
                },
            ];
            assert.deepStrictEqual(c, e);
        });

        it("converts error messages to comments", async () => {
            const p = InMemoryProject.of();
            const m: any[] = [
                { type: "error", message: "what?", extract: "x", hiliteStart: 0, lastColumn: 1, lastLine: 3 },
                { type: "error", message: "huh?", extract: "x", hiliteStart: 4, lastColumn: 5, lastLine: 6 },
                { type: "error", message: "no?", extract: "x", hiliteStart: 9, lastColumn: 8, lastLine: 7 },
            ];
            const a = { path: "chock.html", project: p, siteToSource: noOpSiteToSource, messages: m };
            const c = await htmlValidatorMessagesToReviewComments(a);
            const e = [
                {
                    category: "html-validator",
                    detail: "what?",
                    severity: "error",
                    sourceLocation: { path: "chock.html", offset: 0, columnFrom1: 1, lineFrom1: 3 },
                    subcategory: "html",
                },
                {
                    category: "html-validator",
                    detail: "huh?",
                    severity: "error",
                    sourceLocation: { path: "chock.html", offset: 4, columnFrom1: 5, lineFrom1: 6 },
                    subcategory: "html",
                },
                {
                    category: "html-validator",
                    detail: "no?",
                    severity: "error",
                    sourceLocation: { path: "chock.html", offset: 9, columnFrom1: 8, lineFrom1: 7 },
                    subcategory: "html",
                },
            ];
            assert.deepStrictEqual(c, e);
        });

        it("categorizes css and svg", async () => {
            const p = InMemoryProject.of();
            const m: any[] = [{ type: "error", message: "what?", extract: "x", hiliteStart: 0, lastColumn: 1, lastLine: 3 }];
            for (const t of ["css", "svg", "html"]) {
                const a = { path: `chock.${t}`, project: p, siteToSource: noOpSiteToSource, messages: m };
                const c = await htmlValidatorMessagesToReviewComments(a);
                const e = [
                    {
                        category: "html-validator",
                        detail: "what?",
                        severity: "error",
                        sourceLocation: { path: `chock.${t}`, offset: 0, columnFrom1: 1, lineFrom1: 3 },
                        subcategory: t,
                    },
                ];
                assert.deepStrictEqual(c, e);
            }

        });

        it("uses the provided site to source mapping", async () => {
            const p = InMemoryProject.of();
            const m: any[] = [
                { type: "error", message: "what?", extract: "x", hiliteStart: 0, lastColumn: 1, lastLine: 3 },
                { type: "error", message: "huh?", extract: "x", hiliteStart: 4, lastColumn: 5, lastLine: 6 },
                { type: "error", message: "no?", extract: "x", hiliteStart: 9, lastColumn: 8, lastLine: 7 },
            ];
            let transformed = false;
            const s2s = async (i: SourceLocation) => {
                transformed = true;
                return {
                    path: i.path.replace(/^_site\//, "doc/"),
                    offset: i.offset * 10,
                    columnFrom1: (i.columnFrom1 || -100) + 2,
                    lineFrom1: (i.lineFrom1 || -1000) - 1,
                };
            };
            const a = { path: "_site/chock.html", project: p, siteToSource: s2s, messages: m };
            const c = await htmlValidatorMessagesToReviewComments(a);
            const e = [
                {
                    category: "html-validator",
                    detail: "what?",
                    severity: "error",
                    sourceLocation: { path: "doc/chock.html", offset: 0, columnFrom1: 3, lineFrom1: 2 },
                    subcategory: "html",
                },
                {
                    category: "html-validator",
                    detail: "huh?",
                    severity: "error",
                    sourceLocation: { path: "doc/chock.html", offset: 40, columnFrom1: 7, lineFrom1: 5 },
                    subcategory: "html",
                },
                {
                    category: "html-validator",
                    detail: "no?",
                    severity: "error",
                    sourceLocation: { path: "doc/chock.html", offset: 90, columnFrom1: 10, lineFrom1: 6 },
                    subcategory: "html",
                },
            ];
            assert(transformed, "provided site to source location map not used");
            assert.deepStrictEqual(c, e);
        });

    });

});
