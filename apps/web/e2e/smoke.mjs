// Drives the built site in a real browser: the lead form in Arabic, a license purchase and the order status.
//   node e2e/smoke.mjs http://localhost:3100 [screenshot directory]
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');

const [base = 'http://localhost:3100', shots] = process.argv.slice(2);
const owner = { authorization: `Bearer ${process.env.OWNER_API_TOKEN ?? 'local-owner-token'}` };
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1100, height: 1300 }, deviceScaleFactor: shots ? 2 : 1 });
const shot = async (name) => shots && page.screenshot({ path: `${shots}/${name}.png` });
const step = (text) => console.log(`ok  ${text}`);

// 1. The home page opens in Arabic, right to left, with the company's own wording.
await page.goto(`${base}/ar`);
assert.equal(await page.getAttribute('html', 'dir'), 'rtl');
assert.equal(await page.getAttribute('html', 'lang'), 'ar');
await page.getByRole('heading', { name: 'مراجعة وإنقاذ' }).waitFor();
await page.getByRole('heading', { name: 'ترخيص المطوّر' }).waitFor();
await shot('storefront-ar');
step('home page in Arabic, right to left');

// 2. A visitor asks for a quote on the Project package, and the lead is in the pipeline.
const email = `visitor-${Date.now()}@example.com`;
await page.locator('a[href="/ar/contact?package=project"]').click();
await page.getByLabel('اسمك').fill('نور الخطيب');
await page.getByLabel('البريد الإلكتروني').fill(email);
await page.getByLabel('ماذا تحتاج؟').fill('نحتاج تطبيق Flutter لعميل في دبي.');
await page.getByRole('button', { name: 'أرسل' }).click();
await page.getByText('وصلتنا رسالتك').waitFor();
const leads = await (await fetch(`${base}/api/owner/leads`, { headers: owner })).json();
assert.ok(leads.leads.some((l) => l.email === email && l.package_id === 'project' && l.locale === 'ar'));
step('lead form in Arabic reaches the pipeline');

// 3. A visitor buys a license through the test checkout.
await page.goto(`${base}/en`);
await shot('storefront-en');
await page.locator('a[href="/en/checkout/RETAIL-DEV"]').click();
await page.getByText('59.00 USD').waitFor();
await page.getByLabel('Your name').fill('Layla Haddad');
await page.getByLabel('Email').fill(email);
await page.getByRole('button', { name: 'Continue to payment' }).click();
await page.getByText('No money is taken').waitFor();
await shot('test-payment');
await page.getByRole('button', { name: 'Pay now (test)' }).click();
await page.getByText('Your payment was confirmed').waitFor();
step('license bought through the test checkout');

// 4. The order was delivered, and the buyer can look it up.
const orders = await (await fetch(`${base}/api/owner/orders`, { headers: owner })).json();
const order = orders.orders.find((o) => o.buyer_email === email);
assert.equal(order.status, 'delivered');
await page.getByLabel('Order number').fill(order.number);
await page.getByLabel('Email').fill(email);
await page.getByRole('button', { name: 'Look up' }).click();
await page.getByText('Delivered').waitFor();
await shot('order-status');
step(`order ${order.number} delivered and visible to its buyer`);

// 5. The owner endpoints are closed without the token.
assert.equal((await fetch(`${base}/api/owner/leads`)).status, 401);
step('owner endpoints refuse a caller with no token');

await browser.close();
console.log('smoke test passed');
