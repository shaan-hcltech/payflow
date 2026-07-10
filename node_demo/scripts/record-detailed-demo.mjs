import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, copyFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const outputDir = path.join(root, "demo-output");
const rawDir = path.join(outputDir, "raw-video-detailed");
const baseUrl = process.env.PAYFLOW_DEMO_URL || "http://localhost:8000";
const viewport = { width: 1440, height: 900 };
const mp4Path = path.join(outputDir, "payflow-recovery-agent-detailed-demo.mp4");
const webmPath = path.join(outputDir, "payflow-recovery-agent-detailed-demo.webm");

mkdirSync(outputDir, { recursive: true });
if (existsSync(rawDir)) rmSync(rawDir, { recursive: true, force: true });
mkdirSync(rawDir, { recursive: true });

await ensureServer();
await resetCarrier("carrier_a");
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

  await caption(page, "Full PayFlow walkthrough: workspace, widgets, agent flow, batch impact, and carrier portability.");
  await highlight(page, ".page-header");
  await wait(2600);

  await highlight(page, ".metrics");
  await caption(page, "The top metrics summarize the current stuck-cart queue: volume, dollars at risk, manual minutes, and runtime.");
  await wait(3000);

  await highlight(page, ".database-panel");
  await caption(page, "The failure queue works like a compact operations database. Rows are clickable, and the selected cart drives the inspector.");
  await wait(3200);

  await clickId(page, "cartTrigger");
  await highlight(page, "[data-menu-root='cart']");
  await caption(page, "The demo path menu is custom, searchable-looking, and avoids the basic native dropdown feel.");
  await wait(2400);
  await page.keyboard.press("Escape");
  await wait(500);

  await selectCart(page, "CA-CART-1001");
  await focusPanel(page, "Failure intelligence");
  await caption(page, "Failure intelligence before investigation: selected failure, at-risk amount, pending diagnosis, pending action, and no evidence yet.");
  await wait(4200);

  await highlight(page, ".failure-insight");
  await caption(page, "This panel answers: what failed, what domain it belongs to, what the agent believes, and what evidence supports it.");
  await wait(3600);

  await focusPanel(page, "Impact calculator");
  await caption(page, "The impact calculator turns operational cleanup into a business case: recovered carts, protected revenue, and weekly hours saved.");
  await wait(2800);
  await setSlider(page, "dailyCarts", 2200);
  await caption(page, "Adjust daily stuck carts to model a larger production queue.");
  await wait(1800);
  await setSlider(page, "avgValue", 260);
  await caption(page, "Adjust average cart value to see revenue-at-risk sensitivity.");
  await wait(1800);
  await setSlider(page, "manualMinutes", 18);
  await caption(page, "Adjust manual minutes per cart to quantify operational time saved.");
  await wait(2400);

  await focusPanel(page, "Batch mode");
  await caption(page, "Batch mode runs the seeded queue simulation with deterministic outcomes for a hackathon-ready impact story.");
  await wait(2400);
  await clickId(page, "batchBtn");
  await wait(4200);

  await focusPanel(page, "Carrier portability");
  await caption(page, "Carrier portability proves the architecture story: two carriers, one shared agent core, zero carrier-specific diagnosis branches.");
  await wait(3200);
  await page.locator(".mapping-details summary").click();
  await caption(page, "Open the normalized fields to show how Carrier A and Carrier B raw schemas map into one canonical model.");
  await wait(3600);

  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  await wait(1000);
  await focusInspector(page);
  await caption(page, "The right inspector is the agent console: run controls, recommended action, HITL approval, status, summary, tabs, and state.");
  await wait(3200);

  await highlight(page, "[data-menu-root='override']");
  await caption(page, "The action menu is framed as AI recommended action, and it stays disabled until the agent has a valid policy.");
  await wait(2400);

  await clickId(page, "inspectBtn");
  await caption(page, "Run investigation: the agent progressively plans, intakes data, calls tools, diagnoses, checks safety, and waits for approval.");
  await wait(6200);

  await highlight(page, "#reasoning");
  await caption(page, "Reasoning uses dotted milestones only, keeping the timeline clean while still showing agentic progression.");
  await wait(3000);

  await openTab(page, "Tools");
  await caption(page, "Tools tab: db query, trace, eligibility, and activation details are visible as a transparent transcript.");
  await wait(3400);

  await openTab(page, "State");
  await caption(page, "State tab before approval shows the current before/after comparison and execution evidence area.");
  await wait(2800);

  await openTab(page, "Reasoning");
  await highlight(page, ".actions");
  await caption(page, "Approve and Reject are intentionally calm: mellow green for approval and restrained red for rejection.");
  await wait(2600);
  await clickId(page, "approveBtn");
  await caption(page, "After approval, the executor acts, verification rereads state, and memory updates only after the result is proven.");
  await wait(7800);

  await openTab(page, "State");
  await caption(page, "Now the state comparison shows the recovered outcome, plus the execution result that changed the order.");
  await wait(4200);

  await selectCart(page, "CA-CART-1005");
  await openTab(page, "Reasoning");
  await caption(page, "Safety scenario: credit hold. The policy blocks automation, so no executor call is allowed.");
  await wait(900);
  await clickId(page, "inspectBtn");
  await wait(5600);
  await openTab(page, "Escalation");
  await caption(page, "Escalation packet: the agent stops with evidence instead of pretending every cart should be automated.");
  await wait(4200);

  await selectCart(page, "CA-CART-1010");
  await openTab(page, "Reasoning");
  await caption(page, "Retry scenario: a recoverable action is attempted, verification still fails, and the agent retries exactly once.");
  await wait(900);
  await clickId(page, "inspectBtn");
  await wait(5600);
  await clickId(page, "approveBtn");
  await wait(9500);
  await openTab(page, "Tools");
  await caption(page, "The transcript captures the failed verification, reread, retry, and final escalation path.");
  await wait(4200);

  await clickId(page, "carrierTrigger");
  await highlight(page, "[data-menu-root='carrier']");
  await caption(page, "Carrier switcher: the same workspace moves from Carrier A Order API to Carrier B OMS.");
  await wait(2200);
  await page.locator("#carrierMenu .menu-item", { hasText: "Carrier B (OMS)" }).click();
  await wait(1400);
  await caption(page, "Carrier B queue loads with different raw fields, but the same canonical agent flow.");
  await wait(2600);
  await clickId(page, "inspectBtn");
  await wait(6000);

  await caption(page, "Complete demo: polished workspace, useful widgets, transparent agent reasoning, safe execution, verification, and portability.");
  await wait(3600);
} finally {
  const video = page.video();
  await context.close();
  await browser.close();
  const recordedPath = await video.path();
  copyFileSync(recordedPath, webmPath);
}

transcodeToMp4(webmPath, mp4Path);
console.log(`Detailed MP4 written to ${mp4Path}`);

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
        bottom: 18px;
        transform: translateX(-50%);
        z-index: 10000;
        max-width: min(960px, calc(100vw - 56px));
        padding: 13px 18px;
        border: 1px solid rgba(24, 24, 27, 0.12);
        border-radius: 14px;
        background: rgba(255, 255, 255, 0.95);
        color: #1f2328;
        box-shadow: 0 18px 45px rgba(24, 24, 27, 0.13);
        font: 600 16px/1.4 Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        letter-spacing: 0;
        text-align: center;
        backdrop-filter: blur(12px);
      }
      .demo-highlight {
        outline: 2px solid rgba(31, 111, 235, 0.38) !important;
        outline-offset: 4px !important;
        box-shadow: 0 0 0 7px rgba(31, 111, 235, 0.08) !important;
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

async function highlight(page, selector) {
  await page.evaluate((targetSelector) => {
    document.querySelectorAll(".demo-highlight").forEach((node) => node.classList.remove("demo-highlight"));
    document.querySelector(targetSelector)?.classList.add("demo-highlight");
  }, selector);
}

async function focusPanel(page, title) {
  const panel = page.locator(".panel", { hasText: title }).first();
  await panel.scrollIntoViewIfNeeded();
  await wait(600);
  await panel.evaluate((node) => {
    document.querySelectorAll(".demo-highlight").forEach((item) => item.classList.remove("demo-highlight"));
    node.classList.add("demo-highlight");
  });
}

async function focusInspector(page) {
  await page.locator(".inspector").scrollIntoViewIfNeeded();
  await highlight(page, ".inspector");
}

async function selectCart(page, cartId) {
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await wait(500);
  const row = page.locator("#queueBody .row-button", { hasText: cartId }).first();
  await row.scrollIntoViewIfNeeded();
  await row.click();
  await wait(650);
}

async function openTab(page, label) {
  await page.locator(".tabs .tab", { hasText: label }).click();
  await wait(550);
}

async function setSlider(page, id, value) {
  await page.locator(`#${id}`).evaluate((input, nextValue) => {
    input.value = String(nextValue);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
  await wait(450);
}

async function clickId(page, id) {
  const locator = page.locator(`#${id}`);
  await locator.scrollIntoViewIfNeeded();
  await locator.click();
}

function transcodeToMp4(input, output) {
  const ffmpeg = ffmpegInstaller.path;
  if (!existsSync(ffmpeg)) {
    throw new Error(`ffmpeg was not found at ${ffmpeg}. WebM is available at ${input}`);
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
