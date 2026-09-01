import { chromium } from "playwright-core";

const SP = process.argv[2];
const EXE = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

const browser = await chromium.launch({ executablePath: EXE });

async function check(theme) {
  const page = await browser.newPage({ colorScheme: theme, viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message));
  await page.goto("file://" + SP + "/ruckmetrics.html", { waitUntil: "networkidle" });
  await page.waitForTimeout(400);

  const dots = await page.locator(".rm-plot svg circle").count();
  const title = await page.locator("#rm-title").textContent();
  const legend = await page.locator("#rm-legend").textContent();
  const fresh = await page.locator("#rm-fresh").textContent();

  // exercise a preset switch to a paid one, then a team scatter, then percentile
  await page.selectOption("#rm-rail select", "p2-attack-shape").catch(() => {});
  await page.waitForTimeout(200);
  const paidEmpty = await page.locator(".rm-empty").count();
  const paidWarn = await page.locator(".rm-warn").count();

  await page.selectOption("#rm-rail select", "p1-clean-engine").catch(() => {});
  await page.waitForTimeout(200);
  const pctDots = await page.locator(".rm-plot svg circle").count();

  await page.selectOption("#rm-rail select", "p1-final-summary").catch(() => {});
  await page.waitForTimeout(200);
  const radarPaths = await page.locator(".rm-plot svg path").count();

  // back to default and screenshot
  await page.selectOption("#rm-rail select", "p1-carrier-dna").catch(() => {});
  await page.waitForTimeout(200);
  await page.screenshot({ path: SP + "/shot-" + theme + ".png", fullPage: false });

  console.log(`[${theme}] title="${title}" scatterDots=${dots} pctDots=${pctDots} paidEmpty=${paidEmpty} paidWarn=${paidWarn} radarPaths=${radarPaths}`);
  console.log(`[${theme}] legend="${(legend || "").trim().slice(0, 60)}" fresh="${(fresh || "").trim().slice(0, 50)}"`);
  if (errors.length) { console.log(`[${theme}] CONSOLE ERRORS:`, errors.slice(0, 5)); }
  else console.log(`[${theme}] no console errors`);
  await page.close();
  return { dots, errors: errors.length, paidEmpty, radarPaths };
}

const light = await check("light");
const dark = await check("dark");
await browser.close();

const ok = light.dots > 100 && light.errors === 0 && dark.errors === 0 && light.paidEmpty === 1 && light.radarPaths > 5;
console.log("\nRESULT:", ok ? "PASS" : "FAIL");
process.exit(ok ? 0 : 1);
