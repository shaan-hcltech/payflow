import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, copyFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const outputDir = path.join(root, "demo-output");
const rawDir = path.join(outputDir, "raw-video");
const baseUrl = process.env.PAYFLOW_DEMO_URL || "http://localhost:8000";
const viewport = { width: 1440, height: 900 };
const mp4Path = path.join(outputDir, "payflow-recovery-agent-demo.mp4");
const webmPath = path.join(outputDir, "payflow-recovery-agent-demo.webm");

mkdirSync(outputDir, { recursive: true });
if (existsSync(rawDir)) rmSync(rawDir, { recursive: true, force: true });
mkdirSync(rawDir, { recursive: true });

await ensureServer();
await resetCarrier("verizon");
await resetCarrier("carrier_b");

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport,
  recordVideo: { dir: rawDir, size: viewport }
});
const page = await context.newPage();

try {
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await injectDemoChrome(page);

  await caption(page, "PayFlow Recovery Agent: offline, deterministic demo workspace");
  await wait(1800);

  await caption(page, "The queue shows 12 stuck carts, amount at risk, and manual minutes avoided.");
  await wait(2200);

  await selectCart(page, "VZ-CART-1001");
  await caption(page, "Scenario 1: recoverable Verizon cart with payment/order mismatch evidence.");
  await wait(900);
  await clickId(page, "inspectBtn");
  await caption(page, "The agent plans, calls tools, diagnoses, checks safety, then waits for human approval.");
  await wait(5200);
  await clickId(page, "approveBtn");
  await caption(page, "Human-in-the-loop approval unlocks execution; verification confirms the order recovered.");
  await wait(7200);
  await openTab(page, "State");
  await caption(page, "Before and after state proves the remediation changed the order outcome.");
  await wait(2500);

  await selectCart(page, "VZ-CART-1005");
  await openTab(page, "Reasoning");
  await caption(page, "Scenario 2: credit-hold safety block. The agent escalates instead of executing.");
  await wait(900);
  await clickId(page, "inspectBtn");
  await wait(5200);
  await openTab(page, "Escalation");
  await caption(page, "The escalation packet carries the evidence a WFM or Jira team needs.");
  await wait(3200);

  await selectCart(page, "VZ-CART-1010");
  await openTab(page, "Reasoning");
  await caption(page, "Scenario 3: retry discipline. The agent retries once, then escalates with proof.");
  await wait(900);
  await clickId(page, "inspectBtn");
  await wait(5200);
  await clickId(page, "approveBtn");
  await wait(9000);
  await openTab(page, "Tools");
  await caption(page, "The tool transcript shows the controlled retry and final escalation path.");
  await wait(3000);

  await switchCarrier(page, "Carrier B (OMS)");
  await caption(page, "Same agent core, different carrier schema: Carrier B runs through the same flow.");
  await wait(1600);
  await clickId(page, "inspectBtn");
  await wait(5200);

  await clickId(page, "batchBtn");
  await caption(page, "Batch mode turns the story into business impact: recovered carts, value, and minutes saved.");
  await wait(4200);

  await caption(page, "Demo ready: agentic investigation, safety gates, remediation, verification, and escalation.");
  await wait(2600);
} finally {
  const video = page.video();
  await context.close();
  await browser.close();
  const recordedPath = await video.path();
  copyFileSync(recordedPath, webmPath);
}

transcodeToMp4(webmPath, mp4Path);
console.log(`MP4 written to ${mp4Path}`);

async function ensureServer() {
  const response = await fetch(`${baseUrl}/api/carriers`).catch(() => null);
  if (!response?.ok) {
    throw new Error(`PayFlow server is not reachable at ${baseUrl}. Start it with: py -3.11 python_backend/server.py`);
  }
}

async function resetCarrier(carrier) {
  const response = await fetch(`${baseUrl}/api/reset`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ carrier })
  });
  if (!response.ok) throw new Error(`Unable to reset ${carrier}: ${await response.text()}`);
}

async function injectDemoChrome(page) {
  await page.addStyleTag({
    content: `
      #demoCaption {
        position: fixed;
        left: 50%;
        bottom: 22px;
        transform: translateX(-50%);
        z-index: 10000;
        max-width: min(860px, calc(100vw - 56px));
        padding: 13px 18px;
        border: 1px solid rgba(24, 24, 27, 0.12);
        border-radius: 14px;
        background: rgba(255, 255, 255, 0.94);
        color: #1f2328;
        box-shadow: 0 18px 45px rgba(24, 24, 27, 0.13);
        font: 600 16px/1.4 Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        letter-spacing: 0;
        text-align: center;
        backdrop-filter: blur(12px);
      }
      .demo-highlight {
        outline: 2px solid rgba(31, 111, 235, 0.34) !important;
        outline-offset: 3px !important;
      }
    `
  });
  await page.evaluate(() => {
    const caption = document.createElement("div");
    caption.id = "demoCaption";
    document.body.appendChild(caption);
  });
}

async function caption(page, text) {
  await page.evaluate((value) => {
    const captionNode = document.querySelector("#demoCaption");
    if (captionNode) captionNode.textContent = value;
  }, text);
}

async function selectCart(page, cartId) {
  const row = page.locator("#queueBody .row-button", { hasText: cartId }).first();
  await row.scrollIntoViewIfNeeded();
  await row.click();
  await wait(500);
}

async function switchCarrier(page, label) {
  await clickId(page, "carrierTrigger");
  await page.locator("#carrierMenu .menu-item", { hasText: label }).click();
  await wait(1000);
}

async function openTab(page, label) {
  await page.locator(".tabs .tab", { hasText: label }).click();
  await wait(500);
}

async function clickId(page, id) {
  const locator = page.locator(`#${id}`);
  await locator.scrollIntoViewIfNeeded();
  await locator.click();
}

function transcodeToMp4(input, output) {
  const ffmpeg = ffmpegInstaller.path || path.join(process.env.LOCALAPPDATA || "", "ms-playwright", "ffmpeg-1011", "ffmpeg-win64.exe");
  if (!existsSync(ffmpeg)) {
    throw new Error(`Playwright ffmpeg was not found at ${ffmpeg}. WebM is available at ${input}`);
  }

  const result = spawnSync(ffmpeg, [
    "-y",
    "-i", input,
    "-vf", "format=yuv420p",
    "-movflags", "+faststart",
    output
  ], { stdio: "inherit" });

  if (result.status !== 0) {
    throw new Error(`ffmpeg failed with exit code ${result.status}. WebM is available at ${input}`);
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
