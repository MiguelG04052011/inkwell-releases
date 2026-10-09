// node render/partial.js <storyboard.json> <outDir> <fromFrame> <toFrame>
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const fs = require('fs'); const path = require('path');
const SB = JSON.parse(fs.readFileSync(path.resolve(process.argv[2]), 'utf8'));
const outDir = path.resolve(process.argv[3]); const a = Number(process.argv[4]), b = Number(process.argv[5]);
(async () => {
  const browser = await chromium.launch({ args: ['--allow-file-access-from-files', '--force-color-profile=srgb', '--font-render-hinting=none'] });
  const open = async () => { const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } }); await page.addInitScript((sb) => { window.SB = sb; }, SB); await page.goto('file://' + path.join(__dirname, 'compose.html')); await page.waitForFunction(() => window.SB_READY === true); await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map((i) => i.decode().catch(() => {}))); }); return page; };
  const pages = [await open(), await open()]; let next = a; const fps = SB.fps || 30;
  await Promise.all(pages.map(async (page) => { while (true) { const f = next++; if (f > b) break; await page.evaluate((t) => window.renderAt(t), f / fps); await page.screenshot({ path: path.join(outDir, `f${String(f).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 94 }); } }));
  await browser.close(); console.log('partial done', a, b);
})();
