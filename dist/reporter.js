"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Reporter = void 0;
const TestRail = require("@dlenroc/testrail");
const fs = require("fs");
const glob = require("glob");
const xml2js = require("xml2js");
const logger_1 = require("./logger");
const status_map_1 = require("./status-map");
class Reporter {
    constructor(configuration) {
        this._testCaseIdRegex = /\bC(\d+)\b/g;
        this._testRailMetadataRegex = /(S\d+(?:\s|_)(C\d+\s?)+)/g;
        this._testSuiteIdRegex = /\bS(\d+)\b/;
        this._testResults = new Map();
        this._addTestCaseResult = (testSuiteId, testCaseId, testResult, failureMessage, elapsedTime) => {
            const testCaseResult = {
                case_id: testCaseId,
                comment: failureMessage,
                status_id: status_map_1.StatusMap[testResult],
                elapsed: elapsedTime,
            };
            const testSuiteResult = this._testResults.get(testSuiteId);
            if (testSuiteResult) {
                testSuiteResult.distinctCaseIds.add(testCaseId);
                testSuiteResult.testCaseResults.push(testCaseResult);
            }
            else {
                this._testResults.set(testSuiteId, {
                    distinctCaseIds: new Set().add(testCaseResult.case_id),
                    testCaseResults: [testCaseResult],
                });
            }
        };
        this._collectFileTestResults = async (fileName) => {
            const report = await this._getTestFileJUnitReport(fileName);
            if (!report) {
                return;
            }
            this._parseJUnitReport(report);
        };
        this._getFileNames = () => {
            return new Promise((resolve, reject) => {
                glob(this._configuration.resultsPattern, (error, matches) => {
                    if (error) {
                        reject(error);
                        return;
                    }
                    resolve(matches);
                });
            });
        };
        this._getTestFileJUnitReport = (fileName) => {
            return new Promise((resolve, reject) => {
                fs.readFile(fileName, (error, contents) => {
                    if (error) {
                        reject(error);
                        return;
                    }
                    if (!contents) {
                        resolve(undefined);
                        return;
                    }
                    const parser = new xml2js.Parser();
                    parser.parseString(contents, (parseError, result) => {
                        if (parseError) {
                            reject(parseError);
                            return;
                        }
                        resolve(result);
                    });
                });
            });
        };
        this._isFailureArrayOfStrings = (failure) => {
            return typeof failure[0] === 'string';
        };
        this._parseJUnitReport = (report) => {
            var _a;
            if (!((_a = report.testsuites.testsuite) === null || _a === void 0 ? void 0 : _a.length)) {
                return;
            }
            report.testsuites.testsuite.forEach((currentSuite) => {
                var _a;
                if (!((_a = currentSuite.testcase) === null || _a === void 0 ? void 0 : _a.length)) {
                    return;
                }
                currentSuite.testcase.forEach((currentCase) => {
                    const testRailMetadataMatches = [
                        ...currentCase.$.name.matchAll(this._testRailMetadataRegex),
                    ];
                    let elapsedTime = null;
                    if (currentCase.$.time < 10 && currentCase.$.time > 0.000) {
                        elapsedTime = (currentCase.$.time).toString() + "s";
                    }
                    else if (!currentCase.failure) {
                        elapsedTime = new Date(currentCase.$.time * 1000).toISOString().slice(11, 19);
                    }
                    if (!testRailMetadataMatches.length) {
                        return;
                    }
                    testRailMetadataMatches.forEach((testRailMetadata) => {
                        const testSuiteIdMatch = testRailMetadata[1].match(this._testSuiteIdRegex);
                        if (!testSuiteIdMatch) {
                            return;
                        }
                        const testSuiteId = parseInt(testSuiteIdMatch[1], 10);
                        const testCaseMatches = [...testRailMetadata[1].matchAll(this._testCaseIdRegex)];
                        if (!testCaseMatches.length) {
                            return;
                        }
                        testCaseMatches.forEach((testCaseMatch) => {
                            var _a;
                            const testCaseId = parseInt(testCaseMatch[1], 10);
                            if (!((_a = currentCase.failure) === null || _a === void 0 ? void 0 : _a.length)) {
                                this._addTestCaseResult(testSuiteId, testCaseId, currentCase.skipped === undefined ? 'passed' : 'skipped', null, elapsedTime);
                                return;
                            }
                            let failureMessage;
                            if (this._isFailureArrayOfStrings(currentCase.failure)) {
                                failureMessage = currentCase.failure.join('\n');
                            }
                            else {
                                failureMessage = currentCase.failure.reduce((result, currentFailure) => {
                                    return `${result}${currentFailure._}\n`;
                                }, '');
                            }
                            this._addTestCaseResult(testSuiteId, testCaseId, 'failed', failureMessage, elapsedTime);
                        });
                    });
                });
            });
        };
        this._reportTestSuiteResult = async (api, testSuiteId) => {
            const testSuiteResults = this._testResults.get(testSuiteId);
            if (!(testSuiteResults === null || testSuiteResults === void 0 ? void 0 : testSuiteResults.distinctCaseIds.size) || !(testSuiteResults === null || testSuiteResults === void 0 ? void 0 : testSuiteResults.testCaseResults.length)) {
                logger_1.logger.warning(`We were unable to find any test cases for ${testSuiteId}`);
                return;
            }
            try {
                const testRailRun = await api.addRun(this._configuration.projectId, {
                    case_ids: [...testSuiteResults.distinctCaseIds],
                    include_all: false,
                    name: this._configuration.runName,
                    suite_id: testSuiteId,
                });
                await api.addResultsForCases(testRailRun.id, {
                    results: testSuiteResults.testCaseResults,
                });
                await api.closeRun(testRailRun.id);
                logger_1.logger.info(`Successfully created and closed TestRail run R${testRailRun.id} for S${testSuiteId}!`);
            }
            catch (error) {
                logger_1.logger.error(error);
            }
        };
        this.reportResults = async () => {
            const fileNames = await this._getFileNames();
            if (!fileNames.length) {
                logger_1.logger.warning('No test result files were found.');
                return;
            }
            await Promise.allSettled(fileNames.map(this._collectFileTestResults));
            if (this._testResults.size === 0) {
                logger_1.logger.warning('No test case results were found to report.');
                return;
            }
            const api = new TestRail({
                host: this._configuration.host,
                password: this._configuration.password,
                username: this._configuration.username,
            });
            const testSuiteIds = [...this._testResults.keys()];
            await Promise.allSettled(testSuiteIds.map((testSuiteId) => this._reportTestSuiteResult(api, testSuiteId)));
            logger_1.logger.success('Finished!');
        };
        if (!configuration.host) {
            throw new Error('You must configure the `host` property');
        }
        if (!configuration.password) {
            throw new Error('You must configure the `password` property');
        }
        if (!configuration.projectId) {
            throw new Error('You must configure the `projectId` property');
        }
        if (!configuration.resultsPattern) {
            throw new Error('You must configure the `resultsPattern` property');
        }
        if (!configuration.runName) {
            throw new Error('You must configure the `runName` property');
        }
        if (!configuration.username) {
            throw new Error('You must configure the `username` property');
        }
        this._configuration = configuration;
    }
}
exports.Reporter = Reporter;
