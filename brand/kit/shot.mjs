import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
const D = "/home/user/throwdown/brand";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--allow-file-access-from-files"] });
for (const [f, w, h] of [["pfp", 800, 800], ["banner", 1500, 500], ["launch", 1600, 900]]) {
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: f === "pfp" ? 1 : 2 });
  await p.goto(`file://${D}/kit/${f}.html`); await p.waitForTimeout(800);
  await p.screenshot({ path: `${D}/throwdown-${f}.png` });
}
await b.close();
