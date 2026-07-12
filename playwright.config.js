// Playwright config for klee.page
// Run locally:  PW_BASE_URL=http://localhost:8080 npm test
// Run production: npm test  (defaults to https://klee.page)

const { defineConfig, devices } = require('@playwright/test');

const baseURL = process.env.PW_BASE_URL || 'https://klee.page';

module.exports = defineConfig({
    testDir: './tests',
    timeout: 60 * 1000,
    expect: { timeout: 10 * 1000 },
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 2 : undefined,
    reporter: [
        ['list'],
        ['html', { open: 'never', outputFolder: 'tests/.report' }],
    ],
    use: {
        baseURL,
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
        video: 'retain-on-failure',
    },
    projects: [
        {
            name: 'desktop',
            testMatch: /(smoke|cli|unit)\/.*\.spec\.js/,
            use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
        },
        {
            name: 'mobile',
            testMatch: /(smoke|cli|unit)\/.*\.spec\.js/,
            use: { ...devices['iPhone 14'] },
        },
    ],
});
