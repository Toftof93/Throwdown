import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
const D = "/home/user/throwdown/brand";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--allow-file-access-from-files"] });
const p = await b.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2 });
await p.goto(`file://${D}/kit/thread.html`); await p.waitForTimeout(800);
// Four posts: intro, how it works, the 1v1, the Showcase.
const ids = [1, 3, 4, 5];
for (const [n, i] of ids.entries()) {
  await p.evaluate((i) => document.querySelectorAll(".c").forEach((c) => c.classList.toggle("on", c.id === "t" + i)), i);
  await p.waitForTimeout(150);
  await p.locator(`#t${i}`).screenshot({ path: `${D}/thread-${n + 1}.png` });
}
await b.close();
