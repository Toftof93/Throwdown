import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
const D = "/home/user/throwdown/brand";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--allow-file-access-from-files"] });
const p = await b.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2 });
await p.goto(`file://${D}/kit/hours.html`); await p.waitForTimeout(800);
await p.screenshot({ path: `${D}/throwdown-hours.png` });
await b.close();
