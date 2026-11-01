// node render2/capture.js <storyboard.json> <outDir> [workers] [only-frame-list]
// Renders every frame of an engine-2 storyboard to <outDir>/f%05d.jpg, plus events.json for the sound.
// With a frame list ("0,45,90"), renders just those frames (for checking a cut quickly).
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const fs = require('fs'); const path = require('path');
const sbPath = path.resolve(process.argv[2]); const outDir = path.resolve(process.argv[3]);
const workers = Number(process.argv[4] || 2);
const only = process.argv[5] ? process.argv[5].split(',').map(Number) : null;
const SB = JSON.parse(fs.readFileSync(sbPath, 'utf8'));
const CLIPS = {};
for (const s of SB.shots) {
  if (s.src && s.src.startsWith('c-') && !CLIPS[s.src]) {
    CLIPS[s.src] = JSON.parse(fs.readFileSync(path.join(__dirname, SB.footage, 'clips', s.src, 'clip.json'), 'utf8'));
  }
}
fs.mkdirSync(outDir, { recursive: true });
(async () => {
  const browser = await chromium.launch({ args: ['--disable-web-security', '--allow-file-access-from-files', '--force-color-profile=srgb', '--font-render-hinting=none'] });
  const url = 'file://' + path.join(__dirname, 'compose.html');
  async function open() {
    const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
    page.on('pageerror', (e) => console.log('pageerror', e.message));
    await page.addInitScript(([sb, clips]) => { window.SB = sb; window.CLIPS = clips; }, [SB, CLIPS]);
    await page.goto(url);
    await page.waitForFunction(() => window.SB_READY === true, null, { timeout: 30000 });
    await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map((i) => i.decode().catch(() => {}))); });
    return page;
  }
  const p0 = await open();
  const total = await p0.evaluate(() => window.SB_TOTAL);
  const ev = await p0.evaluate(() => window.SB_EVENTS);
  fs.writeFileSync(path.join(outDir, 'events.json'), JSON.stringify(ev, null, 1));
  const fps = SB.fps || 30; const N = Math.round(total * fps);
  const list = only || [...Array(N).keys()];
  console.log('frames', N, 'seconds', total.toFixed(2), only ? `(rendering ${list.length})` : '');
  const pages = [p0]; for (let i = 1; i < workers; i++) pages.push(await open());
  let next = 0; const t0 = Date.now();
  await Promise.all(pages.map(async (page) => {
    while (true) {
      const j = next++; if (j >= list.length) break;
      const f = list[j];
      await page.evaluate((t) => window.renderAt(t), f / fps);
      await page.screenshot({ path: path.join(outDir, `f${String(f).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 92 });
      if (j % 90 === 0) console.log('frame', f, ((Date.now() - t0) / 1000).toFixed(1) + 's');
    }
  }));
  await browser.close();
  console.log('done', ((Date.now() - t0) / 1000).toFixed(1) + 's');
})().catch((e) => { console.error(e); process.exit(1); });
