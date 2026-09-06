'use strict';

/**
 * Playwright against the packaged application.
 *
 * docs/process/test-runner-migration.md — Phase 2. This runs in the build
 * jobs, never in unit-and-cpm, which has no packaged app to drive.
 */

const path = require('path');

const reportDir = process.env.RUNNER_TEMP
  ? path.join(process.env.RUNNER_TEMP, 'playwright-report')
  : path.join(__dirname, '..', '..', 'out', 'playwright-report');

module.exports = {
  testDir: __dirname,
  testMatch: '**/*.spec.js',
  // A flaky in-app test is worse than a failing one: it teaches people to
  // re-run. If something here is flaky, fix it or delete it.
  retries: 0,
  timeout: 60000,
  workers: 1,
  reporter: [['list'], ['html', { outputFolder: reportDir, open: 'never' }]],
  use: {
    trace: 'retain-on-failure',
    video: 'retain-on-failure'
  }
};
