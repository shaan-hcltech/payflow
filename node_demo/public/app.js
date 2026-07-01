const state = {
  carriers: {},
  carrier: "verizon",
  queue: [],
  cartId: null,
  run: null,
  menus: { open: null, overrideAction: null },
  display: {
    visibleSteps: 0,
    visibleTools: 0,
    showSummary: false,
    showEvidence: false,
    showState: false,
    showEscalation: false,
    status: "Idle",
    detail: "Ready to investigate the selected cart.",
    animating: false,
    pendingMemoryStatus: null,
    pendingReload: false,
    timers: []
  },
  memory: { recovered: 0, escalated: 0, rejected: 0 }
};

const $ = (id) => document.getElementById(id);
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const overrideActions = ["REFLOW", "RESUBMIT_PAYMENT", "RESUBMIT_BALANCE", "CANCEL_AND_REFLOW"];
const actionLabels = {
  REFLOW: "Reflow order ledger",
  RESUBMIT_PAYMENT: "Resubmit payment event",
  RESUBMIT_BALANCE: "Resubmit balance update",
  CANCEL_AND_REFLOW: "Cancel and reflow"
};

init();

async function init() {
  state.carriers = await api("/api/carriers");
  bindEvents();
  await loadQueue();
  updateImpact();
}

function bindEvents() {
  $("carrierTrigger").addEventListener("click", (event) => toggleMenu("carrier", event));
  $("cartTrigger").addEventListener("click", (event) => toggleMenu("cart", event));
  $("overrideTrigger").addEventListener("click", (event) => toggleMenu("override", event));
  $("inspectBtn").addEventListener("click", async () => {
    closeMenus();
    const run = await api("/api/inspect", { carrier: state.carrier, cartId: state.cartId });
    playRun(run);
  });
  $("approveBtn").addEventListener("click", async () => {
    closeMenus();
    const run = await api("/api/run", {
      carrier: state.carrier,
      cartId: state.cartId,
      approval: "APPROVE",
      overrideAction: state.menus.overrideAction
    });
    playRun(run, { rememberStatus: run.status, reloadQueue: true });
  });
  $("rejectBtn").addEventListener("click", async () => {
    closeMenus();
    const run = await api("/api/run", { carrier: state.carrier, cartId: state.cartId, approval: "REJECT" });
    playRun(run, { rememberStatus: run.status });
  });
  $("resetDemoBtn").addEventListener("click", resetDemo);
  $("skipBtn").addEventListener("click", () => finishPlayback({ skipped: true }));
  $("batchBtn").addEventListener("click", runAnimatedBatch);
  for (const id of ["dailyCarts", "avgValue", "manualMinutes"]) {
    $(id).addEventListener("input", updateImpact);
  }
  for (const tab of document.querySelectorAll(".tab")) {
    tab.addEventListener("click", () => selectTab(tab.dataset.tab));
  }
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".menu-control")) closeMenus();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeMenus();
  });
}

async function loadQueue(resetCart = true, preserveMissingSelection = false) {
  const data = await fetch(`/api/queue?carrier=${state.carrier}`).then((res) => res.json());
  state.queue = data.orders;
  $("activeCarrier").textContent = `Active carrier: ${data.display_name}`;
  if (resetCart || (!preserveMissingSelection && !state.queue.some((order) => order.cart_id === state.cartId))) {
    state.cartId = state.queue[0]?.cart_id || null;
  }
  state.menus.overrideAction = null;
  renderAll();
}

async function resetDemo() {
  stopPlayback();
  closeMenus();
  await api("/api/reset", { carrier: state.carrier });
  state.run = null;
  state.memory = { recovered: 0, escalated: 0, rejected: 0 };
  resetDisplay();
  await loadQueue(true);
}

function toggleMenu(name, event) {
  event.stopPropagation();
  if (name === "override" && $("overrideTrigger").disabled) return;
  state.menus.open = state.menus.open === name ? null : name;
  renderMenus();
}

function closeMenus() {
  if (!state.menus.open) return;
  state.menus.open = null;
  renderMenus();
}

async function selectCarrier(carrierId) {
  if (carrierId === state.carrier) {
    closeMenus();
    return;
  }
  stopPlayback();
  state.carrier = carrierId;
  state.run = null;
  resetDisplay();
  closeMenus();
  await loadQueue();
}

function selectCart(cartId) {
  if (state.display.animating) return;
  stopPlayback();
  state.cartId = cartId;
  state.run = null;
  state.menus.overrideAction = null;
  resetDisplay();
  closeMenus();
  renderAll();
}

function selectOverride(action) {
  state.menus.overrideAction = action;
  closeMenus();
  renderAll();
}

function playRun(run, options = {}) {
  stopPlayback();
  state.run = run;
  if (!state.menus.overrideAction && run.policy?.executor_allowed) {
    state.menus.overrideAction = run.policy.action;
  }
  state.display = {
    visibleSteps: 0,
    visibleTools: 0,
    showSummary: false,
    showEvidence: false,
    showState: false,
    showEscalation: false,
    status: "Planning",
    detail: "Preparing the investigation path.",
    animating: !reducedMotion,
    pendingMemoryStatus: options.rememberStatus || null,
    pendingReload: Boolean(options.reloadQueue),
    timers: []
  };

  if (reducedMotion) {
    finishPlayback();
    return;
  }

  renderAll();
  const events = playbackEvents(run);
  let elapsed = 120;
  for (const event of events) {
    elapsed += event.delay;
    state.display.timers.push(window.setTimeout(() => {
      event.apply();
      renderAll();
    }, elapsed));
  }
  state.display.timers.push(window.setTimeout(() => finishPlayback(), elapsed + 280));
}

function playbackEvents(run) {
  const events = [];
  run.steps.forEach((step, index) => {
    events.push({
      delay: delayForStep(step.node),
      apply: () => {
        state.display.visibleSteps = index + 1;
        setStatusForStep(step, run);
        if (step.node === "Diagnosis") state.display.showSummary = true;
        if (step.node === "ApprovalGate") state.display.showEvidence = true;
        if (step.node === "Executor" || step.node === "Verification") state.display.showState = true;
        if (step.node === "EscalationReport") state.display.showEscalation = true;
      }
    });
    if (step.node === "ToolInvestigation") {
      run.tool_calls.forEach((_, toolIndex) => {
        events.push({
          delay: 110,
          apply: () => {
            state.display.visibleTools = toolIndex + 1;
            state.display.status = "Calling tools";
            state.display.detail = "Reading mock system evidence.";
          }
        });
      });
    }
  });
  return events;
}

function delayForStep(node) {
  return {
    Plan: 320,
    Intake: 360,
    ToolInvestigation: 430,
    Diagnosis: 640,
    SelfCritiqueSafetyCheck: 480,
    RemediationPolicy: 420,
    ApprovalGate: 360,
    Executor: 520,
    Verification: 560,
    RetryOrEscalate: 500,
    EscalationReport: 520
  }[node] || 400;
}

function setStatusForStep(step, run) {
  const status = {
    Plan: ["Planning", "Preparing the investigation path."],
    Intake: ["Planning", "Loading cart context."],
    ToolInvestigation: ["Calling tools", "Querying payment, order, trace, and eligibility sources."],
    Diagnosis: ["Diagnosing", "Classifying root cause from collected evidence."],
    SelfCritiqueSafetyCheck: ["Checking safety", "Looking for declined, credit, and pending-order guardrails."],
    RemediationPolicy: ["Checking safety", "Mapping diagnosis to an allowed remediation policy."],
    ApprovalGate: ["Awaiting approval", "Human approval required before executor can act."],
    Executor: ["Executing", "Calling the approved remediation action."],
    Verification: ["Verifying", "Re-reading order state after remediation."],
    RetryOrEscalate: ["Verifying", "Deciding whether one retry is safe or escalation is required."],
    EscalationReport: ["Escalated", "Preparing WFM/Jira-ready escalation context."]
  }[step.node] || ["Working", "Continuing the agent run."];

  if (step.node === "Verification" && step.output?.recovered) {
    state.display.status = "Recovered";
    state.display.detail = "Order state verified as recovered.";
    return;
  }
  if (run.status === "RECOVERED" && step.node === "Verification") {
    state.display.status = "Recovered";
    state.display.detail = "Order state verified as recovered.";
    return;
  }
  state.display.status = status[0];
  state.display.detail = status[1];
}

async function finishPlayback({ skipped = false } = {}) {
  stopPlayback(false);
  if (!state.run) return;
  state.display.visibleSteps = state.run.steps.length;
  state.display.visibleTools = state.run.tool_calls.length;
  state.display.showSummary = true;
  state.display.showEvidence = true;
  state.display.showState = true;
  state.display.showEscalation = Boolean(state.run.escalation_packet);
  state.display.animating = false;
  state.display.status = pretty(state.run.status);
  state.display.detail = skipped ? "Animation skipped. Final agent result is shown." : finalDetail(state.run);

  if (state.display.pendingMemoryStatus) {
    remember(state.display.pendingMemoryStatus);
    state.display.pendingMemoryStatus = null;
  }
  if (state.display.pendingReload) {
    state.display.pendingReload = false;
    await loadQueue(false, true);
  } else {
    renderAll();
  }
}

function finalDetail(run) {
  if (run.status === "RECOVERED") return "Order state verified as recovered.";
  if (run.status === "ESCALATED") return "Automation stopped with an escalation packet.";
  if (run.status === "REJECTED") return "Reviewer rejected automation and routed to WFM.";
  if (run.status === "AWAITING_APPROVAL") return "Human approval required before executor can act.";
  return "Agent run complete.";
}

function stopPlayback(clearRunTimers = true) {
  for (const timer of state.display.timers || []) window.clearTimeout(timer);
  if (clearRunTimers) state.display.timers = [];
  state.display.animating = false;
}

function resetDisplay() {
  state.display = {
    visibleSteps: 0,
    visibleTools: 0,
    showSummary: false,
    showEvidence: false,
    showState: false,
    showEscalation: false,
    status: "Idle",
    detail: "Ready to investigate the selected cart.",
    animating: false,
    pendingMemoryStatus: null,
    pendingReload: false,
    timers: []
  };
}

function renderAll() {
  renderMenus();
  renderMetrics();
  renderQueue();
  renderJourney();
  renderStatus();
  renderRun();
  renderMemory();
}

function renderMenus() {
  renderCarrierMenu();
  renderCartMenu();
  renderOverrideMenu();
}

function renderCarrierMenu() {
  const label = state.carriers[state.carrier] || "Select carrier";
  $("carrierTrigger").innerHTML = triggerHtml(label, state.carrier === "verizon" ? "Reference connector" : "Portable OMS connector");
  setMenuOpen("carrierTrigger", "carrier");
  $("carrierMenu").innerHTML = Object.entries(state.carriers).map(([id, name]) => menuItem({
    id,
    title: name,
    meta: id === "verizon" ? "Order360 reference" : "Different schema, same core",
    selected: id === state.carrier,
    onClick: `select-carrier:${id}`
  })).join("");
  bindMenuItems("carrierMenu");
}

function renderCartMenu() {
  const selected = selectedOrder();
  $("cartTrigger").innerHTML = triggerHtml(
    selected ? `${selected.cart_id} - ${selected.error_type}` : "Select a cart",
    selected ? `${selected.channel} / ${money(selected.amount_at_risk)} at risk` : "Scenario queue"
  );
  setMenuOpen("cartTrigger", "cart");
  $("cartMenu").innerHTML = state.queue.map((order) => menuItem({
    id: order.cart_id,
    title: `${order.cart_id} - ${order.error_type}`,
    meta: `${order.channel} / ${money(order.amount_at_risk)} at risk`,
    selected: order.cart_id === state.cartId,
    onClick: `select-cart:${order.cart_id}`
  })).join("");
  bindMenuItems("cartMenu");
}

function renderOverrideMenu() {
  const disabled = !state.run?.policy?.executor_allowed || state.display.animating;
  const selected = state.menus.overrideAction || state.run?.policy?.action || "";
  const recommended = state.run?.policy?.action || "";
  $("overrideTrigger").disabled = disabled;
  $("overrideTrigger").innerHTML = triggerHtml(
    selected ? actionLabel(selected) : "AI recommended action",
    disabled ? "Available after diagnosis" : selected === recommended ? "AI recommended action" : "Reviewer override"
  );
  setMenuOpen("overrideTrigger", "override");
  $("overrideMenu").innerHTML = overrideActions.map((action) => menuItem({
    id: action,
    title: actionLabel(action),
    meta: action === state.run?.policy?.action ? "Recommended action" : "Manual override",
    selected: action === selected,
    onClick: `select-override:${action}`
  })).join("");
  bindMenuItems("overrideMenu");
}

function triggerHtml(title, meta) {
  return `
    <span class="trigger-copy">
      <span class="trigger-main">${escapeHtml(title)}</span>
      <span class="trigger-meta">${escapeHtml(meta)}</span>
    </span>
  `;
}

function actionLabel(action) {
  return actionLabels[action] || action;
}

function menuItem({ id, title, meta, selected, onClick }) {
  return `
    <button class="menu-item ${selected ? "selected" : ""}" type="button" role="option" aria-selected="${selected}" data-action="${escapeHtml(onClick)}">
      <span class="menu-title">${escapeHtml(title)}</span>
      <span class="menu-meta">${escapeHtml(meta)}</span>
      ${selected ? `<span class="menu-check">Selected</span>` : ""}
    </button>
  `;
}

function bindMenuItems(menuId) {
  for (const item of $(menuId).querySelectorAll("[data-action]")) {
    item.addEventListener("click", handleMenuAction);
  }
}

function handleMenuAction(event) {
  event.stopPropagation();
  const [action, value] = event.currentTarget.dataset.action.split(":");
  if (action === "select-carrier") selectCarrier(value);
  if (action === "select-cart") selectCart(value);
  if (action === "select-override") selectOverride(value);
}

function setMenuOpen(triggerId, menuName) {
  const open = state.menus.open === menuName;
  $(triggerId).setAttribute("aria-expanded", String(open));
  document.querySelector(`[data-menu-root="${menuName}"]`)?.classList.toggle("open", open);
}

function renderMetrics() {
  const risk = state.queue.reduce((sum, order) => sum + order.amount_at_risk, 0);
  $("metricCarts").textContent = state.queue.length;
  $("metricRisk").textContent = money(risk);
  $("metricMinutes").textContent = state.queue.length * 12;
}

function renderQueue() {
  $("queueBody").innerHTML = state.queue.map((order) => `
    <tr class="${order.cart_id === state.cartId ? "row-selected" : ""}" data-cart-id="${escapeHtml(order.cart_id)}">
      <td>
        <button class="row-button" type="button" data-cart-id="${escapeHtml(order.cart_id)}">
          <strong>${escapeHtml(order.cart_id)}</strong>
          <span>${escapeHtml(order.order_number)}</span>
        </button>
      </td>
      <td>${badge(order.channel, "neutral")}</td>
      <td><span class="cell-strong">${escapeHtml(order.error_type)}</span></td>
      <td>${badge(money(order.amount_at_risk), "amber")}</td>
    </tr>
  `).join("");
  for (const button of $("queueBody").querySelectorAll(".row-button")) {
    button.addEventListener("click", () => selectCart(button.dataset.cartId));
  }
}

function renderJourney() {
  const run = state.run;
  const order = run?.order || selectedOrder();
  if (!order) {
    $("journey").innerHTML = `<p class="quiet">Select a cart to inspect the failure profile.</p>`;
    return;
  }

  const rootCause = run?.diagnosis?.root_cause || "AWAITING_INVESTIGATION";
  const domain = failureDomain(rootCause);
  const action = run?.policy?.action ? actionLabel(run.policy.action) : "Pending agent plan";
  const safety = run?.policy ? (run.policy.executor_allowed ? "Eligible with approval" : "Automation blocked") : "Not checked yet";
  const confidence = run?.diagnosis ? `${Math.round(run.diagnosis.confidence * 100)}%` : "Pending";
  const evidence = run?.diagnosis?.evidence || [];

  $("journey").innerHTML = `
    <div class="failure-hero">
      <div>
        <span class="insight-label">Selected failure</span>
        <strong>${escapeHtml(order.cart_id)}</strong>
        <p>${escapeHtml(order.error_type)} on ${escapeHtml(order.channel)} / ${escapeHtml(order.order_number)}</p>
      </div>
      <div class="risk-amount">
        <span>At risk</span>
        <strong>${money(order.amount_at_risk)}</strong>
      </div>
    </div>
    <div class="insight-grid">
      ${insightCard("Failure domain", domain.label, domain.detail, domain.color)}
      ${insightCard("Root cause", run?.diagnosis ? pretty(rootCause) : "Awaiting investigation", confidence, run?.diagnosis ? "blue" : "neutral")}
      ${insightCard("Recommended action", action, safety, run?.policy?.executor_allowed ? "green" : run?.policy ? "red" : "neutral")}
    </div>
    <div class="signal-strip">
      <span class="insight-label">Evidence signals</span>
      <div>
        ${evidence.length && state.display.showEvidence
          ? evidence.slice(0, 4).map((item) => badge(item, "blue")).join("")
          : `<span class="quiet">Run investigation to surface payment, trace, eligibility, and order-state signals.</span>`}
      </div>
    </div>
  `;
}

function insightCard(label, value, detail, color = "neutral") {
  return `
    <div class="insight-card ${color}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <small>${escapeHtml(detail)}</small>
    </div>
  `;
}

function failureDomain(rootCause) {
  if (rootCause.includes("SUBMIT")) {
    return { label: "Submit handoff", detail: "Missing order-completion event", color: "amber" };
  }
  if (rootCause.includes("CREDIT")) {
    return { label: "Credit / activation", detail: "Safety policy blocks executor", color: "red" };
  }
  if (rootCause.includes("PENDING")) {
    return { label: "Eligibility blocker", detail: "Pending order must be cleared", color: "amber" };
  }
  if (rootCause.includes("DECLINED")) {
    return { label: "Payment declined", detail: "Customer or manual path required", color: "red" };
  }
  if (rootCause === "AWAITING_INVESTIGATION") {
    return { label: "Not diagnosed", detail: "Agent has not run yet", color: "neutral" };
  }
  return { label: "Payment ledger", detail: "Payment and order state mismatch", color: "blue" };
}

function renderStatus() {
  const status = $("agentStatus");
  status.className = `agent-status ${statusColorClass(state.display.status)} ${state.display.animating ? "working" : ""}`;
  status.innerHTML = `
    <span class="status-dot"></span>
    <strong>${escapeHtml(state.display.status)}</strong>
    <span>${escapeHtml(state.display.detail)}</span>
  `;
}

function renderRun() {
  const run = state.run;
  const awaiting = run?.status === "AWAITING_APPROVAL" && !state.display.animating;
  $("inspectBtn").disabled = state.display.animating;
  $("approveBtn").disabled = !awaiting;
  $("rejectBtn").disabled = !awaiting;
  $("skipBtn").disabled = !state.display.animating;
  renderOverrideMenu();

  if (!run) {
    $("summary").className = "summary empty";
    $("summary").textContent = "Run investigation to open the agent timeline.";
    $("reasoning").innerHTML = "";
    $("tools").innerHTML = "";
    $("state").innerHTML = "";
    $("escalation").innerHTML = "";
    return;
  }

  if (!state.display.showSummary) {
    $("summary").className = "summary empty";
    $("summary").textContent = "Agent is collecting evidence.";
  } else {
    $("summary").className = "summary summary-enter";
    $("summary").innerHTML = `
      ${badge(pretty(run.diagnosis.root_cause), "blue")}
      ${badge(`Confidence ${Math.round(run.diagnosis.confidence * 100)}%`, "green")}
      ${badge(run.policy.action, run.policy.executor_allowed ? "green" : "red")}
      ${badge(pretty(run.status), statusColor(run.status))}
      <p>${escapeHtml(run.diagnosis.rationale)}</p>
    `;
  }

  const visibleSteps = run.steps.slice(0, state.display.visibleSteps);
  const activeIndex = visibleSteps.length - 1;
  const progress = run.steps.length ? Math.round((visibleSteps.length / run.steps.length) * 100) : 0;
  $("reasoning").innerHTML = `
    <div class="timeline" style="--progress:${progress}%">
      ${visibleSteps.map((item, index) => `
        <div class="step ${index === activeIndex && state.display.animating ? "active" : ""}" style="--delay:${Math.min(index, 8) * 45}ms">
          <strong>${escapeHtml(prettyNode(item.node))}</strong>
          <span>${escapeHtml(item.observation)}</span>
        </div>
      `).join("")}
    </div>
    ${state.display.showEvidence ? `<div class="evidence">${run.diagnosis.evidence.map((item) => badge(item, "blue")).join("")}</div>` : ""}
  `;
  $("tools").innerHTML = run.tool_calls.slice(0, state.display.visibleTools).map((call, index) => `
    <div class="tool" style="--delay:${Math.min(index, 8) * 55}ms">${escapeHtml(call.name)}(${escapeHtml(JSON.stringify(call.inputs))}) -> ${escapeHtml(JSON.stringify(call.output))}</div>
  `).join("") || `<p class="quiet">Tool calls will appear as the agent investigates.</p>`;
  $("state").innerHTML = state.display.showState ? `
    <div class="state-grid">
      ${stateCard("Before", run.before_state)}
      ${stateCard("After", run.after_state)}
    </div>
    ${run.execution_results.length ? `<h2>Execution</h2><pre>${escapeHtml(JSON.stringify(run.execution_results, null, 2))}</pre>` : ""}
  ` : `<p class="quiet">State comparison appears after executor verification.</p>`;
  $("escalation").innerHTML = state.display.showEscalation && run.escalation_packet
    ? `<button id="downloadPacket" type="button">Download escalation packet</button><pre>${escapeHtml(run.escalation_packet.markdown)}</pre>`
    : `<p class="quiet">No escalation packet for this run.</p>`;
  const download = $("downloadPacket");
  if (download) {
    download.addEventListener("click", () => downloadText(`${run.order.cart_id}-escalation.md`, run.escalation_packet.markdown));
  }
}

function stateCard(label, stateValue) {
  return `
    <div class="state-card">
      <h2>${label}</h2>
      <div class="state-kv">
        <div><span>Status</span><strong>${escapeHtml(stateValue?.status_code || "-")}</strong></div>
        <div><span>Reason</span><strong>${escapeHtml(stateValue?.reason_code || "-")}</strong></div>
        <div><span>Pending</span><strong>${escapeHtml(stateValue?.pending_order_number || "-")}</strong></div>
      </div>
    </div>
  `;
}

function remember(status) {
  if (status === "RECOVERED") state.memory.recovered += 1;
  if (status === "ESCALATED") state.memory.escalated += 1;
  if (status === "REJECTED") state.memory.rejected += 1;
}

function renderMemory() {
  $("memRecovered").textContent = state.memory.recovered;
  $("memEscalated").textContent = state.memory.escalated;
  $("memRejected").textContent = state.memory.rejected;
}

function updateImpact() {
  const daily = Number($("dailyCarts").value);
  const avg = Number($("avgValue").value);
  const minutes = Number($("manualMinutes").value);
  const recovered = daily * 0.72;
  $("dailyRecovered").textContent = Math.round(recovered).toLocaleString();
  $("revenueProtected").textContent = money(recovered * avg);
  $("hoursSaved").textContent = Math.round((recovered * minutes * 7) / 60).toLocaleString();
}

async function runAnimatedBatch() {
  $("batchBtn").disabled = true;
  $("batchResult").innerHTML = `
    <div class="batch-progress">
      <div><span></span></div>
    </div>
    <p class="quiet">Running approved batch simulation across seeded carts.</p>
  `;
  const batch = await api("/api/batch", { carrier: state.carrier });
  await wait(reducedMotion ? 0 : 650);
  $("batchResult").innerHTML = `
    <div class="impact batch-enter">
      <div><span>Recovered</span><strong>${batch.recovered}</strong></div>
      <div><span>Recovery rate</span><strong>${Math.round(batch.recovery_rate * 100)}%</strong></div>
      <div><span>Minutes saved</span><strong>${batch.minutes_saved}</strong></div>
    </div>
    <p class="quiet">Recovered value: ${money(batch.amount_recovered)}. Escalated: ${batch.escalated}.</p>
  `;
  $("batchBtn").disabled = false;
}

function selectTab(id) {
  for (const tab of document.querySelectorAll(".tab")) tab.classList.toggle("active", tab.dataset.tab === id);
  for (const panel of document.querySelectorAll(".tab-panel")) panel.classList.toggle("active", panel.id === id);
}

async function api(url, body = null) {
  const options = body ? {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  } : {};
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

function selectedOrder() {
  return state.queue.find((order) => order.cart_id === state.cartId);
}

function badge(text, color) {
  return `<span class="badge ${color}">${escapeHtml(text)}</span>`;
}

function pretty(value) {
  return String(value).replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function prettyNode(value) {
  return String(value)
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2");
}

function statusColor(status) {
  return status === "RECOVERED" ? "green" : status === "ESCALATED" || status === "REJECTED" ? "red" : "amber";
}

function statusColorClass(status) {
  const normalized = String(status).toUpperCase();
  if (normalized.includes("RECOVERED")) return "green";
  if (normalized.includes("ESCALATED") || normalized.includes("REJECTED")) return "red";
  if (normalized.includes("APPROVAL") || normalized.includes("VERIFYING") || normalized.includes("EXECUTING")) return "amber";
  return "blue";
}

function money(value) {
  return Number(value).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function downloadText(filename, text) {
  const blob = new Blob([text], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
