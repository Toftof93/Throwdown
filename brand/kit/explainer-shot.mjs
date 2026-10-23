import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
import fs from "node:fs";
// Usage: node explainer-shot.mjs preview  -> a few still frames
//        node explainer-shot.mjs frames   -> every frame at 30fps into ./frames
const mode = process.argv[2] ?? "preview";
const D = "/home/user/throwdown/brand/kit";
const OUT = "/tmp/claude-0/-home-user/055db6cb-3912-5b25-bf24-2631d508a0e2/scratchpad/vid";
fs.mkdirSync(`${OUT}/frames`, { recursive: true });
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--allow-file-access-from-files"] });
const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
await p.goto(`file://${D}/explainer.html`); await p.waitForTimeout(1000);
const stage = p.locator("#stage");
if (mode === "preview") {
  for (const t of [2.5, 6.5, 11.5, 16.8, 21.5, 26.5, 30]) {
    await p.evaluate((t) => window.render(t), t);
    await stage.screenshot({ path: `${OUT}/prev-${t}.png` });
  }
} else {
  const fps = 30, n = Math.round((await p.evaluate(() => window.DURATION)) * fps);
  for (let i = 0; i < n; i++) {
    await p.evaluate((t) => window.render(t), i / fps);
    await stage.screenshot({ path: `${OUT}/frames/f${String(i).padStart(4, "0")}.jpg`, type: "jpeg", quality: 92 });
  }
  console.log("frames", n);
}
await b.close();
