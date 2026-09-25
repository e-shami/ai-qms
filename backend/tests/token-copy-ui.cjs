// Browser tests live here to keep frontend edits confined to the two owned forms.
// Usage: node backend/tests/token-copy-ui.cjs <directory-containing-esbuild-and-playwright>
const path = require('node:path');
const assert = require('node:assert/strict');
const tools = path.resolve(process.argv[2]);
const { build } = require(path.join(tools, 'esbuild'));
const { chromium } = require(path.join(tools, '@playwright/test'));
const root = path.resolve(__dirname, '../../frontend');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge' });
  let scenarios = 0;
  try {
    for (const kind of ['public', 'admin']) {
      const source = kind === 'public'
        ? `import Join from './src/app/(public)/join/page'; const element = <Join/>;`
        : `import {IssueTokenForm} from './src/components/tokens/issue-token-form'; const element = <IssueTokenForm counters={[{id:1,name:'General',is_active:true}]}/>;`;
      const bundle = await build({
        stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; ${source} createRoot(document.getElementById('root')).render(element);`, resolveDir: root, loader: 'tsx' },
        bundle: true, write: false, platform: 'browser', jsx: 'automatic', tsconfig: path.join(root, 'tsconfig.json'),
        define: { 'process.env.NODE_ENV': '"production"', 'process.env.NEXT_PUBLIC_API_URL': '"http://qms.test/api/v1"' },
        plugins: [{ name: 'no-next-navigation', setup(build) {
          build.onResolve({ filter: /^next\/link$/ }, () => ({ path: 'link', namespace: 'test' }));
          build.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: `import React from 'react'; export default function Link(props){return React.createElement('a',props)}`, resolveDir: root }));
        } }],
      });
      const statuses = kind === 'public' ? ['not_requested', 'action_required', 'unavailable'] : ['not_requested', 'accepted', 'failed', 'unknown', 'unavailable'];
      for (const status of statuses) {
        const page = await browser.newPage({ viewport: { width: scenarios % 2 ? 390 : 1280, height: 900 } });
        const requests = [];
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));
        await page.route('**/*', async route => {
          const request = route.request();
          const url = new URL(request.url());
          if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' });
          let body;
          if (url.pathname.endsWith('/institutions')) body = [{ id: 1, name: 'Test institution', type: 'Clinic' }];
          else if (url.pathname.endsWith('/counters')) body = [{ id: 1, name: 'General', is_active: true }];
          else if (url.pathname.includes('/predictions/')) body = { estimated_wait_min: 0, queue_ahead: 0 };
          else if (url.pathname.endsWith('/tokens') && request.method() === 'POST') {
            requests.push(request.postDataJSON());
            body = { id: 1, token_number: 'GEN-0001', counter_id: 1, counter_name: 'General', position: 1, people_ahead: 0, estimated_wait_min: 0, notification: { status, action_url: status === 'action_required' ? 'https://wa.me/15555550123?text=status' : null } };
          } else throw new Error(`Unexpected network access: ${url.origin}${url.pathname}`);
          return route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
        });
        await page.goto('http://qms.test/');
        await page.addScriptTag({ content: bundle.outputFiles[0].text });
        if (kind === 'public') {
          await page.getByRole('button', { name: /Test institution/ }).click();
          await page.getByRole('button', { name: 'General' }).click();
          await page.getByLabel('CNIC', { exact: true }).fill('0000000000001');
          await page.getByLabel('Referring organization (not a medical referral)').selectOption('website');
        } else {
          await page.locator('#issue-counter').click();
          await page.getByRole('option', { name: 'General' }).click();
          assert.match(await page.locator('#issue-counter').innerText(), /General/);
        }
        const consent = page.getByRole('checkbox', { name: kind === 'public' ? /I want a WhatsApp copy/ : /I confirm the customer/ });
        assert.equal(await consent.isChecked(), false);
        const phone = page.getByRole('textbox', { name: kind === 'public' ? 'Phone (WhatsApp)' : 'Customer phone (optional)' });
        const submit = page.getByRole('button', { name: kind === 'public' ? /Get token for/ : 'Issue token', exact: kind === 'admin' });
        if (status !== 'not_requested') {
          await consent.check();
          await submit.click();
          await page.getByText('Phone is required for a WhatsApp copy', { exact: true }).waitFor();
          assert.equal(requests.length, 0);
          await phone.fill('03111234567');
          await submit.click();
          await page.getByText('Use full international format, e.g. +923111234567', { exact: true }).waitFor();
          assert.equal(requests.length, 0);
        }
        await phone.fill('+1 (555) 555-0123');
        await submit.click();
        if (kind === 'public') await page.getByText('GEN-0001', { exact: true }).waitFor();
        else await page.waitForFunction(() => document.querySelector('#issue-phone').value === '');
        assert.equal(requests.length, 1);
        assert.equal(requests[0].whatsapp_copy, status !== 'not_requested');
        if (status === 'action_required') {
          assert.equal(await page.getByRole('link', { name: 'Request my WhatsApp copy' }).getAttribute('href'), 'https://wa.me/15555550123?text=status');
          await page.getByText(/No copy has been sent/).waitFor();
        } else if (status === 'accepted') await page.getByRole('status').filter({ hasText: 'delivery is not confirmed' }).waitFor();
        else if (status !== 'not_requested') await page.getByRole('status').filter({ hasText: /do not (issue|create) another token/ }).waitFor();
        if (kind === 'admin') assert.equal(await consent.isChecked(), false);
        if (kind === 'public' && status === 'not_requested') assert.equal(await page.getByRole('link', { name: 'Request my WhatsApp copy' }).count(), 0);
        assert.deepEqual(errors, []);
        await page.close();
        scenarios++;
      }
    }
    console.log(`${scenarios} token-copy browser scenarios passed; all HTTP requests mocked.`);
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
