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

import * as assert from "power-assert";
import {
    htmlValidatorMessagesToReviewComments,
    htmlValidatorMessagesToString,
} from "../lib/html-validator";

describe("html-validator", () => {

    describe("htmlValidatorMessagesToReviewComments", () => {

        it("returns no comments when given no messages", () => {
            const c = htmlValidatorMessagesToReviewComments("chuck", []);
            assert(c.length === 0);
        });

        it("filters out info messages", () => {
            const m: any[] = [
                { type: "info", message: "what?", hiliteStart: 0, lastColumn: 0, lastLine: 0 },
                { type: "info", message: "huh?", hiliteStart: 1, lastColumn: 1, lastLine: 1 },
                { type: "info", message: "no?", hiliteStart: 2, lastColumn: 2, lastLine: 2 },
            ];
            const c = htmlValidatorMessagesToReviewComments("nuck", m);
            assert(c.length === 0);
        });

        it("converts error messages to comments", () => {
            const m: any[] = [
                { type: "error", message: "what?", hiliteStart: 0, lastColumn: 1, lastLine: 3 },
                { type: "error", message: "huh?", hiliteStart: 4, lastColumn: 5, lastLine: 6 },
                { type: "error", message: "no?", hiliteStart: 9, lastColumn: 8, lastLine: 7 },
            ];
            const c = htmlValidatorMessagesToReviewComments("chock.html", m);
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

        it("recognizes warnings", () => {
            const m: any[] = [{ type: "error", subType: "warning", message: "what?", hiliteStart: 0, lastColumn: 1, lastLine: 3 }];
            const c = htmlValidatorMessagesToReviewComments("chock.html", m);
            const e = [
                {
                    category: "html-validator",
                    detail: "what?",
                    severity: "warn",
                    sourceLocation: { path: "chock.html", offset: 0, columnFrom1: 1, lineFrom1: 3 },
                    subcategory: "html",
                },
            ];
            assert.deepStrictEqual(c, e);
        });

        it("categorizes css and svg", () => {
            const m: any[] = [{ type: "error", message: "what?", hiliteStart: 0, lastColumn: 1, lastLine: 3 }];
            ["css", "svg", "html"].forEach(t => {
                const c = htmlValidatorMessagesToReviewComments(`chock.${t}`, m);
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
            });

        });

    });

    describe("htmlValidatorMessagesToString", () => {

        it("handles no comments", () => {
            [undefined, []].forEach((m: any) => {
                assert(htmlValidatorMessagesToString(m) === " no results");
            });
        });

        it("put single message on its own line", () => {
            const m: any[] = [
                { type: "info", message: "Using the preset for SVG 1.1 + URL + HTML + MathML 3.0 based on the root namespace." },
            ];
            const s = htmlValidatorMessagesToString(m);
            const e = " info: Using the preset for SVG 1.1 + URL + HTML + MathML 3.0 based on the root namespace.";
            assert(s === e);
        });

        it("puts each message on its own line", () => {
            const m: any[] = [
                { type: "info", message: "what?" },
                { type: "error", message: "huh?", hiliteStart: 0, lastColumn: 1, lastLine: 2 },
                { type: "error", subType: "warning", message: "no?", hiliteStart: 5, lastColumn: 4, lastLine: 3 },
                { type: "error", message: "some?", hiliteStart: 0, lastLine: 6 },
                { type: "error", subType: "warning", message: "where?", hiliteStart: 7, lastColumn: 8 },
            ];
            const s = htmlValidatorMessagesToString(m);
            const e = `
  info: what?
  [2:1] error: huh?
  [3:4] warning: no?
  [6] error: some?
  [:8] warning: where?`;
            assert(s === e);
        });

    });

});
