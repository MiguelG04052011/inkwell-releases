// node render/capture.js <storyboard.json> <outDir> [workers]
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const fs = require('fs'); const path = require('path');
const sbPath = path.resolve(process.argv[2]); const outDir = path.resolve(process.argv[3]);
const workers = Number(process.argv[4] || 4);
const SB = JSON.parse(fs.readFileSync(sbPath, 'utf8'));
fs.mkdirSync(outDir, { recursive: true });
(async () => {
  const browser = await chromium.launch({ args: ['--disable-web-security', '--allow-file-access-from-files', '--force-color-profile=srgb', '--font-render-hinting=none'] });
  const url = 'file://' + path.join(__dirname, 'compose.html');
  async function open() {
    const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
    await page.addInitScript((sb) => { window.SB = sb; }, SB);
    await page.goto(url);
    await page.waitForFunction(() => window.SB_READY === true);
    await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map((i) => i.decode().catch(() => {}))); });
    return page;
  }
  const p0 = await open();
  const total = await p0.evaluate(() => window.SB_TOTAL);
  const times = await p0.evaluate(() => window.SB_TIMES);
  fs.writeFileSync(path.join(outDir, 'times.json'), JSON.stringify(times, null, 1));
  const fps = SB.fps || 30; const N = Math.round(total * fps);
  console.log('frames', N, 'seconds', total.toFixed(2));
  const pages = [p0]; for (let i = 1; i < workers; i++) pages.push(await open());
  let next = 0; const t0 = Date.now();
  await Promise.all(pages.map(async (page) => {
    while (true) {
      const f = next++; if (f >= N) break;
      await page.evaluate((t) => window.renderAt(t), f / fps);
      await page.screenshot({ path: path.join(outDir, `f${String(f).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 94 });
      if (f % 120 === 0) console.log('frame', f, ((Date.now() - t0) / 1000).toFixed(1) + 's');
    }
  }));
  await browser.close();
  console.log('done', ((Date.now() - t0) / 1000).toFixed(1) + 's');
})();
