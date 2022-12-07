#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const process_1 = require("process");
const yargs = require("yargs");
const logger_1 = require("./logger");
const reporter_1 = require("./reporter");
const execute = async () => {
    var _a;
    const cli = yargs
        .command('$0', 'Reports JUnit test results to TestRail', (args) => {
        args.demandCommand(0, 0).usage(`Reports JUnit test results to TestRail

  Usage:
    junit-testrail-reporter [options]`);
    })
        .option('host', {
        alias: 'h',
        default: process.env.TESTRAIL_HOST,
        describe: 'The host of the TestRail server to send results to.',
        type: 'string',
    })
        .option('projectId', {
        default: process.env.TESTRAIL_PROJECT_ID,
        describe: 'The identifier of the TestRail project to send results to.',
        type: 'number',
    })
        .option('resultsPattern', {
        alias: 'p',
        describe: 'Test Results Pattern',
        requiresArg: true,
        type: 'string',
    })
        .option('runName', {
        alias: 'r',
        default: (_a = process.env.TESTRAIL_RUN_NAME) !== null && _a !== void 0 ? _a : 'Automated Test Run via junit-testrail-reporter',
        describe: 'A brief description used to identify the automated test run.',
        type: 'string',
    })
        .option('username', {
        alias: 'u',
        default: process.env.TESTRAIL_USERNAME,
        describe: 'The username of the account to authenticate with TestRail.',
        type: 'string',
    });
    const options = cli.parseSync(process_1.argv.slice(2));
    const reporter = new reporter_1.Reporter({
        host: options.host,
        password: process.env.TESTRAIL_PASSWORD,
        projectId: options.projectId === undefined ? undefined : parseInt(options.projectId, 10),
        resultsPattern: options.resultsPattern,
        runName: options.runName,
        username: options.username,
    });
    await reporter.reportResults();
};
execute()
    .then(() => {
    process.exit(0);
})
    .catch((error) => {
    logger_1.logger.error(error);
    process.exit(-1);
});
