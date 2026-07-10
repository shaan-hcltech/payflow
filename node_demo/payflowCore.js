import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

export const carriers = {
  carrier_a: "Carrier A (Order API)",
  carrier_b: "Carrier B (OMS)"
};

export const actions = {
  PAYMENT_AUTHORIZED_NOT_POSTED: "REFLOW",
  SUBMIT_PAYMENT_MISSING: "RESUBMIT_PAYMENT",
  PARTIAL_SHORT_PAYMENT: "RESUBMIT_BALANCE",
  PAYMENT_DECLINED: "ESCALATE_NOTIFY",
  CREDIT_DENIED_HOLD: "ESCALATE",
  GATEWAY_ORDER_TIMEOUT_RACE: "REFLOW",
  STALE_PENDING_ORDER_BLOCKING: "CANCEL_AND_REFLOW"
};

export function createStore(carrierId) {
  const data = readJson(`payflow/data/${carrierId}/scenarios.json`);
  const config = readJson(`payflow/config/${carrierId}.json`);
  return {
    carrierId,
    displayName: carriers[carrierId],
    config,
    scenarios: structuredClone(data),
    executionLog: []
  };
}

export function getQueue(store) {
  return store.scenarios
    .filter((scenario) => !isRecovered(scenario))
    .map((scenario) => toOrder(store.carrierId, scenario.cart));
}

export function inspect(store, cartId) {
  return runAgent(store, cartId, { approval: "PENDING" });
}

export function runAgent(store, cartId, { approval = "PENDING", overrideAction = null } = {}) {
  const scenario = findScenario(store, cartId);
  const order = toOrder(store.carrierId, scenario.cart);
  const payments = scenario.payment_events.map((item) => toPayment(store.carrierId, item));
  const beforeState = toState(store.carrierId, scenario.order_state);
  const traces = scenario.traces.map((item) => toTrace(store.carrierId, item));
  const eligibility = toEligibility(scenario.eligibility);
  const steps = [];
  const toolCalls = [];

  steps.push(step("Plan", "Agent plan prepared for CP2 recovery.", {
    plan: [
      "inspect cart and order state",
      "read payment events and traces",
      "check pending-order signals",
      "classify root cause",
      "apply safety policy",
      "pause for approval",
      "verify and retry once if needed"
    ]
  }));
  steps.push(step("Intake", `Loaded stuck ${order.channel} cart from ${store.displayName}.`, {
    cart_id: order.cart_id,
    order_number: order.order_number,
    amount_at_risk: order.amount_at_risk
  }));

  toolCalls.push(tool("db_query", { entity: "cart", id: cartId }, order));
  toolCalls.push(tool("db_query", { entity: "payment_events", id: cartId }, { count: payments.length }));
  toolCalls.push(tool("db_query", { entity: "order_state", id: order.order_number }, beforeState));
  toolCalls.push(tool("es_trace", { cart_id: cartId }, { lines: traces.map((line) => line.message) }));
  toolCalls.push(tool("eligibility_check", { mtn: order.mtn }, eligibility));

  steps.push(step("ToolInvestigation", "Gathered payment, order, trace, and eligibility evidence.", {
    payment_events: payments.length,
    trace_lines: traces.length,
    pending_order: eligibility.pending_order_number
  }));

  const diagnosis = diagnose(order, payments, beforeState, traces, eligibility);
  steps.push(step("Diagnosis", diagnosis.rationale, diagnosis));

  const safetyChecks = {
    declined_payment: diagnosis.root_cause === "PAYMENT_DECLINED",
    credit_or_activation_hold: diagnosis.root_cause === "CREDIT_DENIED_HOLD",
    pending_order: Boolean(eligibility.pending || beforeState.pending_order_number),
    amount_short: order.amount_paid < order.amount_due
  };
  steps.push(step("SelfCritiqueSafetyCheck", "Checked executor-blocking and higher-risk signals.", safetyChecks));

  const policy = decidePolicy(store.config, diagnosis);
  steps.push(step("RemediationPolicy", policy.safety_reason, policy));

  if (!policy.executor_allowed) {
    const packet = escalationPacket(order, diagnosis.evidence, [], "Safety policy blocked automated remediation.");
    steps.push(step("EscalationReport", "Generated escalation because the executor is blocked by policy.", { title: packet.title }));
    return result(order, steps, toolCalls, diagnosis, policy, "ESCALATED", beforeState, beforeState, [], packet, null);
  }

  const selectedAction = overrideAction || policy.action;
  steps.push(step("ApprovalGate", "Human approval is required before executor can act.", {
    requested_action: selectedAction,
    approval
  }, approval === "PENDING" ? "waiting" : "complete"));

  if (approval === "PENDING") {
    return result(order, steps, toolCalls, diagnosis, policy, "AWAITING_APPROVAL", beforeState, beforeState, [], null, selectedAction);
  }

  if (approval === "REJECT") {
    const packet = escalationPacket(order, diagnosis.evidence, [], "Human reviewer rejected automation; route to WFM.");
    steps.push(step("EscalationReport", "Generated escalation after reviewer rejection.", { title: packet.title }));
    return result(order, steps, toolCalls, diagnosis, policy, "REJECTED", beforeState, beforeState, [], packet, selectedAction);
  }

  const activation = {
    order_number: order.order_number,
    activation_status: scenario.activation_details.activationStatus,
    raw: scenario.activation_details
  };
  toolCalls.push(tool("order_api_get_activation_details", { order_number: order.order_number }, activation));
  if (activation.activation_status === "DENIED") {
    const packet = escalationPacket(order, diagnosis.evidence, [], "Pre-validation returned activationStatus DENIED.");
    steps.push(step("Executor", "Executor refused to act because activation pre-validation failed.", activation));
    steps.push(step("EscalationReport", "Generated escalation packet after pre-validation refusal.", { title: packet.title }));
    return result(order, steps, toolCalls, diagnosis, policy, "ESCALATED", beforeState, beforeState, [], packet, selectedAction);
  }

  const executions = [];
  let afterState = beforeState;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const execution = executeAction(store, scenario, order, selectedAction);
    executions.push(execution);
    toolCalls.push(tool(toolName(selectedAction), { order_number: order.order_number, attempt }, execution));
    steps.push(step("Executor", execution.message, { action: selectedAction, attempt, success: execution.success }));
    afterState = toState(store.carrierId, scenario.order_state);
    const recovered = afterState.status_code === "COMPLETE" && afterState.reason_code === "RECOVERED";
    steps.push(step("Verification", "Re-read order state after remediation.", {
      status_code: afterState.status_code,
      reason_code: afterState.reason_code,
      recovered
    }));
    if (recovered) {
      return result(order, steps, toolCalls, diagnosis, policy, "RECOVERED", beforeState, afterState, executions, null, selectedAction);
    }
    if (attempt === 1) {
      steps.push(step("RetryOrEscalate", "Verification did not recover the order; retrying once with the same approved action.", {
        retry_allowed: true
      }));
    }
  }

  const packet = escalationPacket(
    order,
    diagnosis.evidence,
    executions.map((item) => item.action),
    "Automation exhausted one retry; WFM should inspect downstream order posting."
  );
  steps.push(step("RetryOrEscalate", "Retry exhausted; routing to escalation.", { retry_allowed: false }));
  steps.push(step("EscalationReport", "Generated WFM/Jira-style packet with evidence and attempted actions.", { title: packet.title }));
  return result(order, steps, toolCalls, diagnosis, policy, "ESCALATED", beforeState, afterState, executions, packet, selectedAction);
}

export function runBatch(carrierId) {
  const store = createStore(carrierId);
  const runs = getQueue(store).map((order) => {
    const inspected = inspect(store, order.cart_id);
    return inspected.policy.executor_allowed ? runAgent(store, order.cart_id, { approval: "APPROVE" }) : inspected;
  });
  const recovered = runs.filter((run) => run.status === "RECOVERED");
  const escalated = runs.filter((run) => run.status === "ESCALATED");
  return {
    total: runs.length,
    recovered: recovered.length,
    escalated: escalated.length,
    recovery_rate: runs.length ? recovered.length / runs.length : 0,
    amount_recovered: recovered.reduce((sum, run) => sum + run.order.amount_at_risk, 0),
    minutes_saved: recovered.length * 12,
    escalations_avoided: recovered.length,
    runs
  };
}

export function diagnose(order, payments, state, traces, eligibility) {
  const text = [state.status_code, state.reason_code, ...traces.map((line) => line.message)].join(" ").toLowerCase();
  if (text.includes("credit") || state.status_code === "HOLD") {
    return diagnosis("CREDIT_DENIED_HOLD", 0.96, "Credit or activation hold signals make automated payment remediation unsafe.", [
      "credit or activation hold signal",
      `state reason ${state.reason_code}`
    ]);
  }
  if (payments.some((payment) => payment.gateway_status === "DECLINED")) {
    return diagnosis("PAYMENT_DECLINED", 0.97, "The payment gateway declined the attempt, so the cart must be escalated or customer-notified.", [
      "gateway status declined",
      "no valid authorization to reuse"
    ]);
  }
  if (eligibility.pending || state.pending_order_number || text.includes("stale pending")) {
    return diagnosis("STALE_PENDING_ORDER_BLOCKING", 0.93, "Eligibility and order state indicate a stale pending order is blocking completion.", [
      "pending order detected",
      `pending order ${eligibility.pending_order_number || state.pending_order_number}`
    ]);
  }
  if (text.includes("timeout") || text.includes("race")) {
    return diagnosis("GATEWAY_ORDER_TIMEOUT_RACE", 0.9, "Payment authorization and order posting appear to have raced or timed out across systems.", [
      "timeout/race signal in order trace",
      `state reason ${state.reason_code}`
    ]);
  }
  if (!payments.length || payments.some((payment) => payment.gateway_status === "MISSING") || text.includes("submit payment missing") || text.includes("submit absent")) {
    return diagnosis("SUBMIT_PAYMENT_MISSING", 0.92, "The cart reached CP2 without a completed submit-payment event.", [
      "submit payment event missing",
      "order is waiting for payment submit"
    ]);
  }
  if (order.amount_paid < order.amount_due || payments.some((payment) => payment.gateway_status === "PARTIAL")) {
    return diagnosis("PARTIAL_SHORT_PAYMENT", 0.91, "A payment exists, but the captured amount does not cover the order balance.", [
      `amount paid ${order.amount_paid.toFixed(2)} is below amount due ${order.amount_due.toFixed(2)}`,
      "partial authorization signal"
    ]);
  }
  if (payments.some((payment) => payment.gateway_status === "AUTHORIZED" && !payment.posted_to_order)) {
    return diagnosis("PAYMENT_AUTHORIZED_NOT_POSTED", 0.94, "Payment was authorized but never posted to the order ledger.", [
      "payment authorized",
      "posted_to_order is false",
      "order remains payment pending"
    ]);
  }
  return diagnosis("PAYMENT_AUTHORIZED_NOT_POSTED", 0.72, "The safest recoverable interpretation is an order ledger synchronization miss.", [
    "fallback matched payment/order completion mismatch"
  ]);
}

function decidePolicy(config, diagnosisResult) {
  const entry = config.actions[diagnosisResult.root_cause];
  return {
    root_cause: diagnosisResult.root_cause,
    action: entry.action,
    autonomy: entry.autonomy,
    executor_allowed: Boolean(entry.executor_allowed),
    requires_approval: Boolean(entry.executor_allowed),
    safety_reason: entry.executor_allowed
      ? "Executor allowed after explicit human approval."
      : "Safety policy blocks executor for declined or credit-denied cases."
  };
}

function executeAction(store, scenario, order, action) {
  store.executionLog.push({ cart_id: order.cart_id, action });
  scenario.attempted_actions ||= [];
  scenario.attempted_actions.push(action);
  if (scenario.remediation_behavior === "fail_after_reflow" && action === "REFLOW") {
    return { action, attempted: true, success: false, message: "Reflow accepted, but order state remained stuck.", raw: { attempt_count: scenario.attempted_actions.length } };
  }
  if (["REFLOW", "RESUBMIT_PAYMENT", "RESUBMIT_BALANCE"].includes(action)) {
    for (const payment of scenario.payment_events) {
      if ("gateway_status" in payment) {
        payment.gateway_status = "AUTHORIZED";
        payment.posted_to_order = true;
        payment.auth_amount = Math.max(Number(payment.auth_amount || 0), order.amount_due);
      } else {
        payment.processor_state = "AUTHORIZED";
        payment.ledger_posted = true;
        payment.authorized_value = Math.max(Number(payment.authorized_value || 0), order.amount_due);
      }
    }
    if ("amount_paid" in scenario.cart) scenario.cart.amount_paid = order.amount_due;
    else scenario.cart.captured_amount = order.amount_due;
    setRecovered(scenario);
    return { action, attempted: true, success: true, message: `${action} completed.`, raw: {} };
  }
  if (action === "CANCEL_AND_REFLOW") {
    if ("pending_order_number" in scenario.order_state) scenario.order_state.pending_order_number = null;
    if ("blocking_order_ref" in scenario.order_state) scenario.order_state.blocking_order_ref = null;
    scenario.eligibility.inEligibility.pendingOrder = false;
    scenario.eligibility.pendingOrderDetail.pendingOrderNumber = null;
    setRecovered(scenario);
    return { action, attempted: true, success: true, message: "Pending order cancelled and cart reflowed.", raw: {} };
  }
  return { action, attempted: false, success: false, message: "Escalation actions are not executable.", raw: {} };
}

function setRecovered(scenario) {
  if ("status" in scenario.cart) scenario.cart.status = "RECOVERED";
  else scenario.cart.basket_state = "RECOVERED";
  if ("eo_stat_cd" in scenario.order_state) {
    scenario.order_state.eo_stat_cd = "COMPLETE";
    scenario.order_state.eo_stat_rsn_cd = "RECOVERED";
  } else {
    scenario.order_state.ord_status_code = "COMPLETE";
    scenario.order_state.hold_reason_code = "RECOVERED";
  }
}

function toOrder(carrierId, raw) {
  if (carrierId === "carrier_a") {
    return order({
      cart_id: raw.cart_id,
      carrier_id: carrierId,
      channel: raw.channel,
      order_number: raw.order_number,
      mtn: raw.mtn,
      location_code: raw.location_code,
      master_order_number: raw.master_ord_no,
      stack_id: raw.nsa_stack_id,
      app_number: raw.app_num,
      amount_due: raw.amount_due,
      amount_paid: raw.amount_paid,
      status: raw.status,
      created_ts: raw.created_ts,
      error_type: raw.error_type,
      raw: structuredClone(raw)
    });
  }
  return order({
    cart_id: raw.basket_ref,
    carrier_id: carrierId,
    channel: raw.sales_motion,
    order_number: raw.oms_order_id,
    mtn: raw.subscriber_ref,
    location_code: raw.store_code,
    master_order_number: raw.parent_order_id,
    stack_id: raw.bundle_id,
    app_number: raw.application_ref,
    amount_due: raw.balance_due,
    amount_paid: raw.captured_amount,
    status: raw.basket_state,
    created_ts: raw.created_at,
    error_type: raw.failure_label,
    raw: structuredClone(raw)
  });
}

function order(data) {
  return { ...data, amount_at_risk: Math.max(Number(data.amount_due), Number(data.amount_paid)) };
}

function toPayment(carrierId, raw) {
  if (carrierId === "carrier_a") {
    return {
      cart_id: raw.cart_id,
      attempt_no: raw.attempt_no,
      gateway_status: raw.gateway_status,
      auth_amount: raw.auth_amount,
      posted_to_order: raw.posted_to_order,
      gateway_response: raw.gateway_response,
      ts: raw.ts,
      raw: structuredClone(raw)
    };
  }
  return {
    cart_id: raw.basket_ref,
    attempt_no: raw.try_index,
    gateway_status: raw.processor_state,
    auth_amount: raw.authorized_value,
    posted_to_order: raw.ledger_posted,
    gateway_response: raw.processor_message,
    ts: raw.created_at,
    raw: structuredClone(raw)
  };
}

function toState(carrierId, raw) {
  if (carrierId === "carrier_a") {
    return {
      order_number: raw.order_number,
      status_code: raw.eo_stat_cd,
      reason_code: raw.eo_stat_rsn_cd,
      pending_order_number: raw.pending_order_number || null,
      raw: structuredClone(raw)
    };
  }
  return {
    order_number: raw.oms_order_id,
    status_code: raw.ord_status_code,
    reason_code: raw.hold_reason_code,
    pending_order_number: raw.blocking_order_ref || null,
    raw: structuredClone(raw)
  };
}

function toTrace(carrierId, raw) {
  if (carrierId === "carrier_a") {
    return { cart_id: raw.cart_id, ts: raw.ts, service: raw.service, level: raw.level, message: raw.message, raw: structuredClone(raw) };
  }
  return { cart_id: raw.basket_ref, ts: raw.created_at, service: raw.component, level: raw.severity, message: raw.text, raw: structuredClone(raw) };
}

function toEligibility(raw) {
  const detail = raw.pendingOrderDetail || {};
  return {
    pending: Boolean(raw.inEligibility?.pendingOrder || detail.pendingOrderNumber),
    pending_order_number: detail.pendingOrderNumber || null,
    raw: structuredClone(raw)
  };
}

function findScenario(store, cartId) {
  const scenario = store.scenarios.find((item) => toOrder(store.carrierId, item.cart).cart_id === cartId);
  if (!scenario) throw new Error(`Unknown cart: ${cartId}`);
  return scenario;
}

function isRecovered(scenario) {
  const cartStatus = scenario.cart.status || scenario.cart.basket_state;
  const stateStatus = scenario.order_state.eo_stat_cd || scenario.order_state.ord_status_code;
  const reason = scenario.order_state.eo_stat_rsn_cd || scenario.order_state.hold_reason_code;
  return cartStatus === "RECOVERED" || (stateStatus === "COMPLETE" && reason === "RECOVERED");
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function diagnosis(rootCause, confidence, rationale, evidence) {
  return { root_cause: rootCause, confidence, rationale, evidence };
}

function step(node, observation, output = {}, status = "complete") {
  return { node, observation, output, status, ts: new Date().toISOString() };
}

function tool(name, inputs, output) {
  return { name, inputs, output };
}

function result(order, steps, toolCalls, diagnosisResult, policy, status, beforeState, afterState, executions, escalation, approvedAction) {
  return {
    order,
    steps,
    tool_calls: toolCalls,
    diagnosis: diagnosisResult,
    policy,
    status,
    before_state: beforeState,
    after_state: afterState,
    execution_results: executions,
    escalation_packet: escalation,
    approved_action: approvedAction
  };
}

function escalationPacket(order, evidence, actionsAttempted, recommendation) {
  return {
    title: `PayFlow escalation for ${order.cart_id}`,
    summary: `${order.channel} cart ${order.cart_id} remains blocked at CP2.`,
    cart_context: {
      cart_id: order.cart_id,
      order_number: order.order_number,
      channel: order.channel,
      mtn: order.mtn,
      amount_at_risk: `$${order.amount_at_risk.toFixed(2)}`,
      error_type: order.error_type
    },
    evidence,
    attempted_actions: actionsAttempted,
    recommendation,
    markdown: [
      `# PayFlow escalation for ${order.cart_id}`,
      "",
      "## Summary",
      `${order.channel} cart ${order.cart_id} remains blocked at CP2.`,
      "",
      "## Evidence",
      ...evidence.map((item) => `- ${item}`),
      "",
      "## Attempted Actions",
      ...(actionsAttempted.length ? actionsAttempted : ["None"]).map((item) => `- ${item}`),
      "",
      "## Recommendation",
      recommendation
    ].join("\n")
  };
}

function toolName(action) {
  return {
    REFLOW: "order_api_reflow",
    RESUBMIT_PAYMENT: "order_api_submit_payment",
    RESUBMIT_BALANCE: "order_api_submit_payment",
    CANCEL_AND_REFLOW: "order_api_cancel_and_reflow"
  }[action] || "order_api_action";
}
