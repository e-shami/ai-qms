// Run: node tests/intake-priority.browser.mjs <directory-containing-esbuild-and-playwright>
// Uses an installed Edge browser; all HTTP and socket traffic is isolated/mocked.
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const load = createRequire(import.meta.url);
const tools = path.resolve(process.argv[2]);
const { build } = load(path.join(tools, 'esbuild'));
const { chromium } = load(path.join(tools, '@playwright/test'));
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function bundle(source) {
  const result = await build({
    stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import {Toaster} from 'react-hot-toast'; ${source} createRoot(document.getElementById('root')).render(<><App/><Toaster/></>);`, resolveDir: root, loader: 'tsx' },
    bundle: true, write: false, platform: 'browser', jsx: 'automatic', tsconfig: path.join(root, 'tsconfig.json'),
    define: { 'process.env.NODE_ENV': '"production"', 'process.env.NEXT_PUBLIC_API_URL': '"http://qms.test/api/v1"' },
    plugins: [{ name: 'isolated-browser', setup(build) {
      build.onResolve({ filter: /^next\/link$/ }, () => ({ path: 'link', namespace: 'test' }));
      build.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: 'navigation', namespace: 'test' }));
      build.onResolve({ filter: /\/lib\/socket$/ }, () => ({ path: 'socket', namespace: 'test' }));
      build.onLoad({ filter: /.*/, namespace: 'test' }, ({ path: name }) => ({
        contents: name === 'link' ? `import React from 'react'; export default function Link(props){return React.createElement('a',props)}`
          : name === 'navigation' ? `export const useParams = () => ({number:'GEN-0007'}); export const useSearchParams = () => new URLSearchParams('institution=1');`
          : `const listeners = new Set(); window.queueEvent = data => listeners.forEach(fn => fn(data)); export const queueSocket = {connect(){}, forceReconnect(){}, subscribe(fn){listeners.add(fn); return () => listeners.delete(fn)}, subscribeState(){return () => {}}, subscribePresence(){return () => {}}, isConnected(){return false}};`,
        resolveDir: root,
      }));
    } }],
  });
  return result.outputFiles[0].text;
}

async function mount(browser, source, handler, width = 1280) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => new URL(route.request().url()).pathname === '/'
    ? route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }) : handler(route));
  await page.goto('http://qms.test/');
  await page.addScriptTag({ content: await bundle(source) });
  return { page, errors };
}
const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const session = `import {useAuthStore} from './src/store/auth'; useAuthStore.setState({accessToken:'session-a',user:{id:1,institution_id:1,role:'admin'}});`;
const baseToken = { id: 7, token_number: 'GEN-0007', status: 'waiting', position: 4, requested_priority: 'accessibility', effective_priority: 'normal', priority_reason: 'elderly', priority_review: 'pending' };

(async () => {
  const browser = await chromium.launch({ channel: 'msedge' });
  try {
    // Public flow: native controls, validation, hospital switching, submit race, privacy.
    for (const width of [390, 1280]) {
      const posts = [];
      let issuance;
      const { page, errors } = await mount(browser, `import Join from './src/app/(public)/join/page'; const App = Join;`, async route => {
        const url = new URL(route.request().url());
        if (url.pathname.endsWith('/institutions')) return json(route, [{ id: 1, name: 'Hospital', type: ' Hospital ' }, { id: 2, name: 'Bank', type: 'bank' }]);
        if (url.pathname.endsWith('/counters')) return json(route, [{ id: Number(url.pathname.split('/')[5]), name: 'General' }]);
        if (route.request().method() === 'POST') { posts.push(route.request().postDataJSON()); issuance = route; return; }
        throw new Error(`Unexpected request ${url}`);
      }, width);
      await page.getByRole('button', { name: 'Hospital Hospital' }).click();
      await page.getByRole('button', { name: 'General', exact: true }).click();
      await page.getByLabel('Accessibility priority request (optional)').selectOption('elderly');
      await page.getByLabel('Back to institutions').click();
      await page.getByRole('button', { name: /^Bank/ }).click();
      assert.equal(await page.getByText('Your details', { exact: true }).count(), 0);
      await page.getByRole('button', { name: 'General', exact: true }).click();
      assert.equal(await page.getByLabel('Accessibility priority request (optional)').count(), 0);
      const submit = page.getByRole('button', { name: /Get token for/ });
      const cnic = page.getByLabel('CNIC', { exact: true });
      for (const invalid of ['00000000000012', '１２３４５６７８９０１２３', '00000-0000000']) {
        await cnic.fill(invalid);
        await submit.click();
        await page.getByText(/CNIC must contain exactly/).first().waitFor();
        assert.equal(posts.length, 0);
      }
      await cnic.fill('0000000000001');
      await page.getByLabel('Referring organization (not a medical referral)').selectOption('other');
      await page.getByLabel('Other organization name').fill('   ');
      await submit.click();
      await page.getByText('Enter the other organization name').waitFor();
      assert.equal(posts.length, 0);
      await page.getByLabel('Other organization name').fill(' Partner ');
      await submit.click();
      await page.waitForFunction(() => document.querySelector('[aria-label="Back to institutions"]').disabled);
      assert.equal(await cnic.isDisabled(), true);
      await page.waitForTimeout(50);
      assert.equal(posts.length, 1);
      assert.equal(posts[0].customer_cnic, '0000000000001');
      assert.equal(posts[0].referral_organization, 'Partner');
      assert.equal(posts[0].requested_priority, 'normal');
      assert.equal(posts[0].priority_reason, null);
      assert.equal(posts[0].whatsapp_copy, false);
      await json(issuance, { token_number: 'GEN-0007', counter_name: 'General', position: 4, people_ahead: 3, estimated_wait_min: 10, requested_priority: 'normal', effective_priority: 'normal', priority_review: 'not_requested' });
      await page.getByText('GEN-0007', { exact: true }).waitFor();
      assert.doesNotMatch(await page.locator('#root').innerText(), /0000000000001|Partner/);
      assert.deepEqual(errors, []);
      await page.close();
    }

    // Public issued and live tickets report server review state, never its private reason.
    for (const width of [390, 1280]) {
      let review = 'pending';
      const publicTicket = () => ({ token_number: 'GEN-0007', status: 'waiting', counter_id: 1, counter_name: 'General',
        position: 4, people_ahead: 3, estimated_wait_min: 10, issued_at: '2026-09-24T10:00:00Z', called_at: null, completed_at: null,
        requested_priority: 'accessibility', effective_priority: review === 'approved' ? 'accessibility' : 'normal', priority_review: review,
        priority_reason: 'disability', customer_cnic: '0000000000001' });
      const joined = await mount(browser, `import Join from './src/app/(public)/join/page'; const App = Join;`, route => {
        const url = new URL(route.request().url());
        if (url.pathname.endsWith('/institutions')) return json(route, [{ id: 1, name: 'Hospital', type: 'hospital' }]);
        if (url.pathname.endsWith('/counters')) return json(route, [{ id: 1, name: 'General' }]);
        return json(route, publicTicket());
      }, width);
      await joined.page.getByRole('button', { name: /^Hospital/ }).click();
      await joined.page.getByRole('button', { name: 'General', exact: true }).click();
      await joined.page.getByLabel('CNIC', { exact: true }).fill('0000000000001');
      await joined.page.getByLabel('Referring organization (not a medical referral)').selectOption('website');
      await joined.page.getByLabel('Accessibility priority request (optional)').selectOption('disability');
      await joined.page.getByRole('button', { name: /Get token for/ }).click();
      await joined.page.getByText(/pending staff verification/).waitFor();
      assert.doesNotMatch(await joined.page.locator('#root').innerText(), /disability|0000000000001/);
      assert.deepEqual(joined.errors, []);
      await joined.page.close();

      const live = await mount(browser, `import Ticket from './src/app/(public)/token/[number]/page'; const App = Ticket;`, route => json(route, publicTicket()), width);
      await live.page.getByText(/pending staff verification/).waitFor();
      for (const next of ['approved', 'rejected', 'normal']) {
        review = next;
        await live.page.getByRole('button', { name: 'Refresh', exact: true }).click();
        await live.page.getByText(next === 'normal' ? /returned to normal/ : new RegExp(`request: ${next}`)).waitFor();
        assert.doesNotMatch(await live.page.locator('#root').innerText(), /disability|0000000000001/);
      }
      assert.deepEqual(live.errors, []);
      await live.page.close();
    }

    // Admin intake remains optional and preserves explicit WhatsApp copy consent.
    {
      const posts = [];
      const { page, errors } = await mount(browser, `${session}
        import {IssueTokenForm} from './src/components/tokens/issue-token-form';
        function App(){return <IssueTokenForm counters={[{id:1,name:'General',is_active:true}]}/>}`, route => {
        const url = new URL(route.request().url());
        if (url.pathname.endsWith('/institutions/me')) return json(route, { id: 1, name: 'Hospital', type: 'hospital' });
        if (url.pathname.includes('/predictions/')) return json(route, { estimated_wait_min: 0, queue_ahead: 0 });
        if (route.request().method() === 'POST') { posts.push(route.request().postDataJSON()); return json(route, { ...baseToken, notification: { status: 'accepted' } }); }
        throw new Error(`Unexpected request ${url}`);
      });
      await page.waitForTimeout(100);
      assert.deepEqual(errors, []);
      await page.getByRole('combobox', { name: 'Counter', exact: true }).click();
      await page.getByRole('option', { name: 'General', exact: true }).click();
      await page.getByLabel('Accessibility priority request (optional)').selectOption('disability');
      await page.getByLabel('Customer phone (optional)', { exact: true }).fill('+15555550123');
      await page.getByRole('checkbox').check();
      await page.getByRole('button', { name: 'Issue token', exact: true }).click();
      await page.getByText(/WhatsApp accepted the copy; delivery is not confirmed/).waitFor();
      assert.equal(posts.length, 1);
      assert.equal(posts[0].customer_cnic, null);
      assert.equal(posts[0].referral_source, null);
      assert.equal(posts[0].requested_priority, 'accessibility');
      assert.equal(posts[0].priority_reason, 'disability');
      assert.equal(posts[0].whatsapp_copy, true);
      assert.deepEqual(errors, []);
      await page.close();
    }

    // Tenant review: synchronous double clicks issue one POST; conflicts reload state.
    {
      const requests = [];
      let pending;
      const { page, errors } = await mount(browser, `${session}
        import {PriorityReview} from './src/components/tokens/priority-review';
        function App(){ const [token,setToken] = React.useState(${JSON.stringify(baseToken)}); return <PriorityReview token={token} hospital onDone={async () => {const r = await fetch('/review-refresh'); setToken(await r.json())}}/>; }`, route => {
        if (route.request().method() === 'POST') { requests.push({ url: route.request().url(), body: route.request().postDataJSON(), auth: route.request().headers().authorization }); pending = route; return; }
        return json(route, { ...baseToken, status: 'called' });
      });
      const approve = page.getByRole('button', { name: 'Approve accessibility' });
      await approve.evaluate(button => { button.click(); button.click(); });
      await page.waitForTimeout(100);
      assert.equal(requests.length, 1);
      assert.equal(requests[0].url, 'http://qms.test/api/v1/tokens/7/priority');
      assert.deepEqual(requests[0].body, { decision: 'approve' });
      assert.equal(requests[0].auth, 'Bearer session-a');
      await json(pending, { detail: 'Token is called, expected waiting' }, 409);
      await page.getByText('Token is called, expected waiting').waitFor();
      await approve.waitFor({ state: 'detached' });
      assert.deepEqual(errors, []);
      await page.close();
    }

    // Staff can review beyond the first ten waiting tokens without changing clinical service.
    {
      const counter = { id: 1, name: 'General', is_active: true };
      const tokens = Array.from({ length: 11 }, (_, index) => ({ ...baseToken, id: index + 1, token_number: `GEN-${index + 1}`, position: index + 1 }));
      const requests = [];
      let approved = false;
      const { page, errors } = await mount(browser, `${session}
        useAuthStore.setState({user:{id:1,institution_id:1,role:'staff'}});
        import Workspace from './src/app/(staff)/workspace/page'; const App = Workspace;`, route => {
        const url = new URL(route.request().url());
        const queue = { counter, tokens: approved ? [{ ...tokens[10], position: 1, effective_priority: 'accessibility', priority_review: 'approved' }, ...tokens.slice(0, 10).map(t => ({...t, position:t.position + 1}))] : tokens, waiting_count: 11 };
        if (url.pathname.endsWith('/institutions/me')) return json(route, { id: 1, name: 'Hospital', type: 'hospital' });
        if (url.pathname.endsWith('/counters')) return json(route, [counter]);
        if (url.pathname.endsWith('/queue')) return json(route, { institution_id: 1, counters: [queue], updated_at: new Date().toISOString() });
        if (url.pathname.endsWith('/staff/workspace')) return json(route, { name: 'Staff member', counter, queue, today: {}, work_status: 'available' });
        if (route.request().method() === 'POST') {
          requests.push({ path: url.pathname, body: route.request().postDataJSON() });
          approved = true;
          return json(route, queue.tokens[10]);
        }
        throw new Error(`Unexpected request ${url}`);
      }, 390);
      const last = page.getByRole('listitem').filter({ hasText: 'GEN-11' });
      await last.getByRole('button', { name: 'Approve accessibility' }).click();
      await last.getByText('Effective: accessibility').waitFor();
      assert.deepEqual(requests, [{ path: '/api/v1/tokens/11/priority', body: { decision: 'approve' } }]);
      assert.match(await page.getByRole('listitem').first().innerText(), /GEN-11/);
      assert.equal(await last.getByRole('button', { name: 'Call', exact: true }).isEnabled(), true);
      assert.deepEqual(errors, []);
      await page.close();
    }

    // Queries: old GET cannot overwrite WS-triggered refresh, filters, or another session.
    {
      const gets = [];
      const { page, errors } = await mount(browser, `${session}
        import {useTokens} from './src/hooks/use-resources';
        function App(){const [status,setStatus] = React.useState('waiting'); const {tokens,error} = useTokens({status,limit:50,offset:50,counterId:9}); return <><button onClick={() => setStatus('served')}>Filter</button><button onClick={() => useAuthStore.setState({accessToken:'session-b'})}>Session</button><p>{tokens?.[0]?.token_number ?? 'Loading'}</p><p>{error}</p></>}`, route => { gets.push(route); });
      const waitGets = async count => { for (let i = 0; gets.length < count && i < 100; i++) await page.waitForTimeout(10); assert.ok(gets.length >= count); };
      await waitGets(1);
      const url = new URL(gets[0].request().url());
      assert.equal(url.searchParams.get('status'), 'waiting');
      assert.equal(url.searchParams.get('offset'), '50');
      assert.equal(url.searchParams.get('counter_id'), '9');
      await page.evaluate(() => window.queueEvent());
      await waitGets(2);
      await json(gets[1], { items: [{ ...baseToken, token_number: 'FRESH' }], total: 1 });
      await page.getByText('FRESH', { exact: true }).waitFor();
      await json(gets[0], { items: [{ ...baseToken, token_number: 'STALE' }], total: 1 });
      await page.getByRole('button', { name: 'Filter' }).click();
      await waitGets(3);
      assert.equal(new URL(gets[2].request().url()).searchParams.get('status'), 'served');
      await page.getByText('Loading', { exact: true }).waitFor();
      await page.getByRole('button', { name: 'Session', exact: true }).click();
      await waitGets(4);
      await json(gets[2], { items: [{ ...baseToken, token_number: 'OTHER-SESSION' }], total: 1 });
      await json(gets[3], { items: [{ ...baseToken, token_number: 'CURRENT' }], total: 1 });
      await page.getByText('CURRENT', { exact: true }).waitFor();
      assert.doesNotMatch(await page.locator('#root').innerText(), /STALE|OTHER-SESSION/);
      assert.deepEqual(errors, []);
      await page.close();
    }
    // A live queue frame must supersede an older in-flight dashboard GET.
    {
      const gets = [];
      const { page, errors } = await mount(browser, `${session}
        import {useQueue} from './src/hooks/use-queue';
        function App(){ const {snapshot} = useQueue(); return <p>{snapshot?.counters[0]?.tokens[0]?.token_number ?? 'Loading'}</p> }`, route => { gets.push(route); });
      for (let i = 0; gets.length === 0 && i < 100; i++) await page.waitForTimeout(10);
      assert.ok(gets.length > 0);
      const snapshot = { institution_id: 1, updated_at: '2026-09-24T12:00:00Z', counters: [{ tokens: [{ ...baseToken, token_number: 'LIVE' }] }] };
      await page.evaluate(data => window.queueEvent(data), snapshot);
      await page.getByText('LIVE', { exact: true }).waitFor();
      await json(gets[0], { ...snapshot, updated_at: '2026-09-24T11:59:00Z', counters: [{ tokens: [{ ...baseToken, token_number: 'OLD-GET' }] }] });
      await page.waitForTimeout(100);
      assert.equal(await page.locator('#root').innerText(), 'LIVE');
      assert.deepEqual(errors, []);
      await page.close();
    }
    console.log('9 isolated browser scenarios passed (mobile/desktop intake and issued/live priority privacy, admin optional intake/copy, review conflict/double click, staff review/reorder, query/session and queue/socket races).');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
