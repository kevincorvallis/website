// Optional layer: AI-resilient tests via Stagehand. SKIPPED by default.
//
// To enable:
//   1. npm i -D @browserbasehq/stagehand
//   2. Set OPENAI_API_KEY in your shell
//   3. Remove the `test.describe.skip(...)` below
//
// Why this layer exists: brittle selector tests fail on every UI tweak. Stagehand
// uses an LLM to interpret high-level intent — "click the publish button", "see the
// reader page" — so the test survives DOM refactors as long as the user-visible
// behavior is the same.
//
// Cost note: every assertion makes one LLM call. Run this layer on a schedule (nightly
// CI cron), not on every push. Estimated cost ~$0.01 per test run.
//
// Reference: https://github.com/browserbase/stagehand

const { test } = require('@playwright/test');

test.describe.skip('AI-resilient — Stagehand (disabled, enable with OPENAI_API_KEY)', () => {
    test('a guest can navigate from landing to sign-in', async () => {
        // const { Stagehand } = require('@browserbasehq/stagehand');
        // const sh = new Stagehand({ env: 'LOCAL', enableCaching: true });
        // await sh.init();
        // await sh.page.goto(process.env.PW_BASE_URL || 'https://klee.page');
        // await sh.act('click the primary "Start writing" call-to-action');
        // const onSignIn = await sh.observe('the current page is the sign-in page with Continue with Google and Continue with Apple buttons');
        // expect(onSignIn).toBe(true);
        // await sh.close();
    });

    test('the editor template picker offers exactly three real templates', async () => {
        // const { Stagehand } = require('@browserbasehq/stagehand');
        // const sh = new Stagehand({ env: 'LOCAL' });
        // await sh.init();
        // await sh.page.goto((process.env.PW_BASE_URL || 'https://klee.page') + '/dispatch/editor/');
        // await sh.page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
        // await sh.page.reload();
        // const templates = await sh.extract({
        //     instruction: 'list the available templates by name',
        //     schema: { templates: { type: 'array', items: { type: 'string' } } },
        // });
        // expect(templates.templates.length).toBe(3);
        // await sh.close();
    });
});
