const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const fs = require('fs'); const path = require('path');
const SB = JSON.parse(fs.readFileSync(path.resolve(process.argv[2]), 'utf8'));
const out = path.resolve(process.argv[3]); const times = process.argv[4].split(',').map(Number);
(async () => {
  const browser = await chromium.launch({ args: ['--allow-file-access-from-files'] });
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  page.on('console', (m) => console.log('console:', m.text())); page.on('pageerror', (e) => console.log('pageerror:', e.message));
  await page.addInitScript((sb) => { window.SB = sb; }, SB);
  await page.goto('file://' + path.join(__dirname, 'compose.html'));
  await page.waitForFunction(() => window.SB_READY === true, null, { timeout: 15000 });
  await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map((i) => i.decode().catch(() => {}))); });
  console.log(JSON.stringify(await page.evaluate(() => window.SB_TIMES)));
  const shots = [];
  for (const t of times) { await page.evaluate((t) => window.renderAt(t), t); const p = `${out}-${t}.jpg`; await page.screenshot({ path: p, type: 'jpeg', quality: 80 }); shots.push(p); }
  await browser.close();
})();
