from __future__ import annotations

import copy
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

CARRIERS = {
    "verizon": "Verizon (Order360)",
    "carrier_b": "Carrier B (OMS)",
}


def create_store(carrier_id: str) -> dict:
    return {
        "carrier_id": carrier_id,
        "display_name": CARRIERS[carrier_id],
        "config": _read_json(ROOT / "payflow" / "config" / f"{carrier_id}.json"),
        "scenarios": _read_json(ROOT / "payflow" / "data" / carrier_id / "scenarios.json"),
        "execution_log": [],
    }


def get_queue(store: dict) -> list[dict]:
    return [
        _to_order(store["carrier_id"], scenario["cart"])
        for scenario in store["scenarios"]
        if not _is_recovered(scenario)
    ]


def inspect(store: dict, cart_id: str) -> dict:
    return run_agent(store, cart_id, approval="PENDING")


def run_agent(store: dict, cart_id: str, approval: str = "PENDING", override_action: str | None = None) -> dict:
    scenario = _find_scenario(store, cart_id)
    order = _to_order(store["carrier_id"], scenario["cart"])
    payments = [_to_payment(store["carrier_id"], item) for item in scenario["payment_events"]]
    before_state = _to_state(store["carrier_id"], scenario["order_state"])
    traces = [_to_trace(store["carrier_id"], item) for item in scenario["traces"]]
    eligibility = _to_eligibility(scenario["eligibility"])
    steps: list[dict] = []
    tool_calls: list[dict] = []

    steps.append(_step("Plan", "Agent plan prepared for CP2 recovery.", {
        "plan": [
            "inspect cart and order state",
            "read payment events and traces",
            "check pending-order signals",
            "classify root cause",
            "apply safety policy",
            "pause for approval",
            "verify and retry once if needed",
        ]
    }))
    steps.append(_step("Intake", f"Loaded stuck {order['channel']} cart from {store['display_name']}.", {
        "cart_id": order["cart_id"],
        "order_number": order["order_number"],
        "amount_at_risk": order["amount_at_risk"],
    }))

    tool_calls.extend([
        _tool("db_query", {"entity": "cart", "id": cart_id}, order),
        _tool("db_query", {"entity": "payment_events", "id": cart_id}, {"count": len(payments)}),
        _tool("db_query", {"entity": "order_state", "id": order["order_number"]}, before_state),
        _tool("es_trace", {"cart_id": cart_id}, {"lines": [line["message"] for line in traces]}),
        _tool("eligibility_check", {"mtn": order["mtn"]}, eligibility),
    ])
    steps.append(_step("ToolInvestigation", "Gathered payment, order, trace, and eligibility evidence.", {
        "payment_events": len(payments),
        "trace_lines": len(traces),
        "pending_order": eligibility["pending_order_number"],
    }))

    diagnosis = diagnose(order, payments, before_state, traces, eligibility)
    steps.append(_step("Diagnosis", diagnosis["rationale"], diagnosis))
    steps.append(_step("SelfCritiqueSafetyCheck", "Checked executor-blocking and higher-risk signals.", {
        "declined_payment": diagnosis["root_cause"] == "PAYMENT_DECLINED",
        "credit_or_activation_hold": diagnosis["root_cause"] == "CREDIT_DENIED_HOLD",
        "pending_order": bool(eligibility["pending"] or before_state["pending_order_number"]),
        "amount_short": order["amount_paid"] < order["amount_due"],
    }))

    policy = decide_policy(store["config"], diagnosis)
    steps.append(_step("RemediationPolicy", policy["safety_reason"], policy))

    if not policy["executor_allowed"]:
        packet = _packet(order, diagnosis["evidence"], [], "Safety policy blocked automated remediation.")
        steps.append(_step("EscalationReport", "Generated escalation because the executor is blocked by policy.", {"title": packet["title"]}))
        return _result(order, steps, tool_calls, diagnosis, policy, "ESCALATED", before_state, before_state, [], packet, None)

    selected_action = override_action or policy["action"]
    steps.append(_step("ApprovalGate", "Human approval is required before executor can act.", {
        "requested_action": selected_action,
        "approval": approval,
    }, status="waiting" if approval == "PENDING" else "complete"))

    if approval == "PENDING":
        return _result(order, steps, tool_calls, diagnosis, policy, "AWAITING_APPROVAL", before_state, before_state, [], None, selected_action)

    if approval == "REJECT":
        packet = _packet(order, diagnosis["evidence"], [], "Human reviewer rejected automation; route to WFM.")
        steps.append(_step("EscalationReport", "Generated escalation after reviewer rejection.", {"title": packet["title"]}))
        return _result(order, steps, tool_calls, diagnosis, policy, "REJECTED", before_state, before_state, [], packet, selected_action)

    activation = {
        "order_number": order["order_number"],
        "activation_status": scenario["activation_details"]["activationStatus"],
        "raw": scenario["activation_details"],
    }
    tool_calls.append(_tool("order360_get_activation_details", {"order_number": order["order_number"]}, activation))
    if activation["activation_status"] == "DENIED":
        packet = _packet(order, diagnosis["evidence"], [], "Pre-validation returned activationStatus DENIED.")
        steps.append(_step("Executor", "Executor refused to act because activation pre-validation failed.", activation))
        steps.append(_step("EscalationReport", "Generated escalation packet after pre-validation refusal.", {"title": packet["title"]}))
        return _result(order, steps, tool_calls, diagnosis, policy, "ESCALATED", before_state, before_state, [], packet, selected_action)

    executions = []
    after_state = copy.deepcopy(before_state)
    for attempt in range(1, 3):
        execution = _execute(store, scenario, order, selected_action)
        executions.append(execution)
        tool_calls.append(_tool(_tool_name(selected_action), {"order_number": order["order_number"], "attempt": attempt}, execution))
        steps.append(_step("Executor", execution["message"], {"action": selected_action, "attempt": attempt, "success": execution["success"]}))
        after_state = _to_state(store["carrier_id"], scenario["order_state"])
        recovered = after_state["status_code"] == "COMPLETE" and after_state["reason_code"] == "RECOVERED"
        steps.append(_step("Verification", "Re-read order state after remediation.", {
            "status_code": after_state["status_code"],
            "reason_code": after_state["reason_code"],
            "recovered": recovered,
        }))
        if recovered:
            return _result(order, steps, tool_calls, diagnosis, policy, "RECOVERED", before_state, after_state, executions, None, selected_action)
        if attempt == 1:
            steps.append(_step("RetryOrEscalate", "Verification did not recover the order; retrying once with the same approved action.", {"retry_allowed": True}))

    packet = _packet(
        order,
        diagnosis["evidence"],
        [item["action"] for item in executions],
        "Automation exhausted one retry; WFM should inspect downstream order posting.",
    )
    steps.append(_step("RetryOrEscalate", "Retry exhausted; routing to escalation.", {"retry_allowed": False}))
    steps.append(_step("EscalationReport", "Generated WFM/Jira-style packet with evidence and attempted actions.", {"title": packet["title"]}))
    return _result(order, steps, tool_calls, diagnosis, policy, "ESCALATED", before_state, after_state, executions, packet, selected_action)


def run_batch(carrier_id: str) -> dict:
    store = create_store(carrier_id)
    runs = []
    for order in get_queue(store):
        inspected = inspect(store, order["cart_id"])
        if inspected["policy"]["executor_allowed"]:
            runs.append(run_agent(store, order["cart_id"], approval="APPROVE"))
        else:
            runs.append(inspected)
    recovered = [run for run in runs if run["status"] == "RECOVERED"]
    escalated = [run for run in runs if run["status"] == "ESCALATED"]
    return {
        "total": len(runs),
        "recovered": len(recovered),
        "escalated": len(escalated),
        "recovery_rate": len(recovered) / len(runs) if runs else 0,
        "amount_recovered": sum(run["order"]["amount_at_risk"] for run in recovered),
        "minutes_saved": len(recovered) * 12,
        "escalations_avoided": len(recovered),
        "runs": runs,
    }


def diagnose(order: dict, payments: list[dict], state: dict, traces: list[dict], eligibility: dict) -> dict:
    text = " ".join([state["status_code"], state["reason_code"], *[line["message"] for line in traces]]).lower()
    if "credit" in text or state["status_code"] == "HOLD":
        return _diagnosis("CREDIT_DENIED_HOLD", 0.96, "Credit or activation hold signals make automated payment remediation unsafe.", [
            "credit or activation hold signal",
            f"state reason {state['reason_code']}",
        ])
    if any(payment["gateway_status"] == "DECLINED" for payment in payments):
        return _diagnosis("PAYMENT_DECLINED", 0.97, "The payment gateway declined the attempt, so the cart must be escalated or customer-notified.", [
            "gateway status declined",
            "no valid authorization to reuse",
        ])
    if eligibility["pending"] or state["pending_order_number"] or "stale pending" in text:
        return _diagnosis("STALE_PENDING_ORDER_BLOCKING", 0.93, "Eligibility and order state indicate a stale pending order is blocking completion.", [
            "pending order detected",
            f"pending order {eligibility['pending_order_number'] or state['pending_order_number']}",
        ])
    if "timeout" in text or "race" in text:
        return _diagnosis("GATEWAY_ORDER_TIMEOUT_RACE", 0.9, "Payment authorization and order posting appear to have raced or timed out across systems.", [
            "timeout/race signal in order trace",
            f"state reason {state['reason_code']}",
        ])
    if not payments or any(payment["gateway_status"] == "MISSING" for payment in payments) or "submit payment missing" in text or "submit absent" in text:
        return _diagnosis("SUBMIT_PAYMENT_MISSING", 0.92, "The cart reached CP2 without a completed submit-payment event.", [
            "submit payment event missing",
            "order is waiting for payment submit",
        ])
    if order["amount_paid"] < order["amount_due"] or any(payment["gateway_status"] == "PARTIAL" for payment in payments):
        return _diagnosis("PARTIAL_SHORT_PAYMENT", 0.91, "A payment exists, but the captured amount does not cover the order balance.", [
            f"amount paid {order['amount_paid']:.2f} is below amount due {order['amount_due']:.2f}",
            "partial authorization signal",
        ])
    if any(payment["gateway_status"] == "AUTHORIZED" and not payment["posted_to_order"] for payment in payments):
        return _diagnosis("PAYMENT_AUTHORIZED_NOT_POSTED", 0.94, "Payment was authorized but never posted to the order ledger.", [
            "payment authorized",
            "posted_to_order is false",
            "order remains payment pending",
        ])
    return _diagnosis("PAYMENT_AUTHORIZED_NOT_POSTED", 0.72, "The safest recoverable interpretation is an order ledger synchronization miss.", [
        "fallback matched payment/order completion mismatch",
    ])


def decide_policy(config: dict, diagnosis: dict) -> dict:
    entry = config["actions"][diagnosis["root_cause"]]
    return {
        "root_cause": diagnosis["root_cause"],
        "action": entry["action"],
        "autonomy": entry["autonomy"],
        "executor_allowed": bool(entry["executor_allowed"]),
        "requires_approval": bool(entry["executor_allowed"]),
        "safety_reason": "Executor allowed after explicit human approval." if entry["executor_allowed"] else "Safety policy blocks executor for declined or credit-denied cases.",
    }


def _execute(store: dict, scenario: dict, order: dict, action: str) -> dict:
    store["execution_log"].append({"cart_id": order["cart_id"], "action": action})
    scenario.setdefault("attempted_actions", []).append(action)
    if scenario.get("remediation_behavior") == "fail_after_reflow" and action == "REFLOW":
        return {"action": action, "attempted": True, "success": False, "message": "Reflow accepted, but order state remained stuck.", "raw": {"attempt_count": len(scenario["attempted_actions"])}}
    if action in {"REFLOW", "RESUBMIT_PAYMENT", "RESUBMIT_BALANCE"}:
        for payment in scenario["payment_events"]:
            if "gateway_status" in payment:
                payment["gateway_status"] = "AUTHORIZED"
                payment["posted_to_order"] = True
                payment["auth_amount"] = max(float(payment.get("auth_amount", 0)), order["amount_due"])
            else:
                payment["processor_state"] = "AUTHORIZED"
                payment["ledger_posted"] = True
                payment["authorized_value"] = max(float(payment.get("authorized_value", 0)), order["amount_due"])
        if "amount_paid" in scenario["cart"]:
            scenario["cart"]["amount_paid"] = order["amount_due"]
        else:
            scenario["cart"]["captured_amount"] = order["amount_due"]
        _set_recovered(scenario)
        return {"action": action, "attempted": True, "success": True, "message": f"{action} completed.", "raw": {}}
    if action == "CANCEL_AND_REFLOW":
        scenario["order_state"]["pending_order_number"] = None
        scenario["order_state"]["blocking_order_ref"] = None
        scenario["eligibility"]["inEligibility"]["pendingOrder"] = False
        scenario["eligibility"]["pendingOrderDetail"]["pendingOrderNumber"] = None
        _set_recovered(scenario)
        return {"action": action, "attempted": True, "success": True, "message": "Pending order cancelled and cart reflowed.", "raw": {}}
    return {"action": action, "attempted": False, "success": False, "message": "Escalation actions are not executable.", "raw": {}}


def _set_recovered(scenario: dict) -> None:
    if "status" in scenario["cart"]:
        scenario["cart"]["status"] = "RECOVERED"
    else:
        scenario["cart"]["basket_state"] = "RECOVERED"
    if "eo_stat_cd" in scenario["order_state"]:
        scenario["order_state"]["eo_stat_cd"] = "COMPLETE"
        scenario["order_state"]["eo_stat_rsn_cd"] = "RECOVERED"
    else:
        scenario["order_state"]["ord_status_code"] = "COMPLETE"
        scenario["order_state"]["hold_reason_code"] = "RECOVERED"


def _to_order(carrier_id: str, raw: dict) -> dict:
    if carrier_id == "verizon":
        order = {
            "cart_id": raw["cart_id"],
            "carrier_id": carrier_id,
            "channel": raw["channel"],
            "order_number": raw["order_number"],
            "mtn": raw["mtn"],
            "location_code": raw["location_code"],
            "master_order_number": raw["master_ord_no"],
            "stack_id": raw["nsa_stack_id"],
            "app_number": raw["app_num"],
            "amount_due": float(raw["amount_due"]),
            "amount_paid": float(raw["amount_paid"]),
            "status": raw["status"],
            "created_ts": raw["created_ts"],
            "error_type": raw["error_type"],
            "raw": copy.deepcopy(raw),
        }
    else:
        order = {
            "cart_id": raw["basket_ref"],
            "carrier_id": carrier_id,
            "channel": raw["sales_motion"],
            "order_number": raw["oms_order_id"],
            "mtn": raw["subscriber_ref"],
            "location_code": raw["store_code"],
            "master_order_number": raw["parent_order_id"],
            "stack_id": raw["bundle_id"],
            "app_number": raw["application_ref"],
            "amount_due": float(raw["balance_due"]),
            "amount_paid": float(raw["captured_amount"]),
            "status": raw["basket_state"],
            "created_ts": raw["created_at"],
            "error_type": raw["failure_label"],
            "raw": copy.deepcopy(raw),
        }
    order["amount_at_risk"] = max(order["amount_due"], order["amount_paid"])
    return order


def _to_payment(carrier_id: str, raw: dict) -> dict:
    if carrier_id == "verizon":
        return {
            "cart_id": raw["cart_id"],
            "attempt_no": raw["attempt_no"],
            "gateway_status": raw["gateway_status"],
            "auth_amount": float(raw["auth_amount"]),
            "posted_to_order": bool(raw["posted_to_order"]),
            "gateway_response": raw["gateway_response"],
            "ts": raw["ts"],
            "raw": copy.deepcopy(raw),
        }
    return {
        "cart_id": raw["basket_ref"],
        "attempt_no": raw["try_index"],
        "gateway_status": raw["processor_state"],
        "auth_amount": float(raw["authorized_value"]),
        "posted_to_order": bool(raw["ledger_posted"]),
        "gateway_response": raw["processor_message"],
        "ts": raw["created_at"],
        "raw": copy.deepcopy(raw),
    }


def _to_state(carrier_id: str, raw: dict) -> dict:
    if carrier_id == "verizon":
        return {
            "order_number": raw["order_number"],
            "status_code": raw["eo_stat_cd"],
            "reason_code": raw["eo_stat_rsn_cd"],
            "pending_order_number": raw.get("pending_order_number"),
            "raw": copy.deepcopy(raw),
        }
    return {
        "order_number": raw["oms_order_id"],
        "status_code": raw["ord_status_code"],
        "reason_code": raw["hold_reason_code"],
        "pending_order_number": raw.get("blocking_order_ref"),
        "raw": copy.deepcopy(raw),
    }


def _to_trace(carrier_id: str, raw: dict) -> dict:
    if carrier_id == "verizon":
        return {"cart_id": raw["cart_id"], "ts": raw["ts"], "service": raw["service"], "level": raw["level"], "message": raw["message"], "raw": copy.deepcopy(raw)}
    return {"cart_id": raw["basket_ref"], "ts": raw["created_at"], "service": raw["component"], "level": raw["severity"], "message": raw["text"], "raw": copy.deepcopy(raw)}


def _to_eligibility(raw: dict) -> dict:
    detail = raw.get("pendingOrderDetail") or {}
    return {
        "pending": bool((raw.get("inEligibility") or {}).get("pendingOrder") or detail.get("pendingOrderNumber")),
        "pending_order_number": detail.get("pendingOrderNumber"),
        "raw": copy.deepcopy(raw),
    }


def _find_scenario(store: dict, cart_id: str) -> dict:
    for scenario in store["scenarios"]:
        if _to_order(store["carrier_id"], scenario["cart"])["cart_id"] == cart_id:
            return scenario
    raise KeyError(cart_id)


def _is_recovered(scenario: dict) -> bool:
    cart = scenario["cart"]
    state = scenario["order_state"]
    cart_status = cart.get("status") or cart.get("basket_state")
    state_status = state.get("eo_stat_cd") or state.get("ord_status_code")
    reason = state.get("eo_stat_rsn_cd") or state.get("hold_reason_code")
    return cart_status == "RECOVERED" or (state_status == "COMPLETE" and reason == "RECOVERED")


def _packet(order: dict, evidence: list[str], actions: list[str], recommendation: str) -> dict:
    markdown = "\n".join([
        f"# PayFlow escalation for {order['cart_id']}",
        "",
        "## Summary",
        f"{order['channel']} cart {order['cart_id']} remains blocked at CP2.",
        "",
        "## Evidence",
        *[f"- {item}" for item in evidence],
        "",
        "## Attempted Actions",
        *[f"- {item}" for item in (actions or ["None"])],
        "",
        "## Recommendation",
        recommendation,
    ])
    return {
        "title": f"PayFlow escalation for {order['cart_id']}",
        "summary": f"{order['channel']} cart {order['cart_id']} remains blocked at CP2.",
        "cart_context": {
            "cart_id": order["cart_id"],
            "order_number": order["order_number"],
            "channel": order["channel"],
            "mtn": order["mtn"],
            "amount_at_risk": f"${order['amount_at_risk']:.2f}",
            "error_type": order["error_type"],
        },
        "evidence": evidence,
        "attempted_actions": actions,
        "recommendation": recommendation,
        "markdown": markdown,
    }


def _result(order, steps, tool_calls, diagnosis, policy, status, before_state, after_state, executions, escalation, approved_action):
    return {
        "order": order,
        "steps": steps,
        "tool_calls": tool_calls,
        "diagnosis": diagnosis,
        "policy": policy,
        "status": status,
        "before_state": before_state,
        "after_state": after_state,
        "execution_results": executions,
        "escalation_packet": escalation,
        "approved_action": approved_action,
    }


def _diagnosis(root_cause: str, confidence: float, rationale: str, evidence: list[str]) -> dict:
    return {"root_cause": root_cause, "confidence": confidence, "rationale": rationale, "evidence": evidence}


def _step(node: str, observation: str, output: dict | None = None, status: str = "complete") -> dict:
    return {"node": node, "observation": observation, "output": output or {}, "status": status}


def _tool(name: str, inputs: dict, output: dict) -> dict:
    return {"name": name, "inputs": inputs, "output": output}


def _tool_name(action: str) -> str:
    return {
        "REFLOW": "order360_reflow",
        "RESUBMIT_PAYMENT": "order360_submit_payment",
        "RESUBMIT_BALANCE": "order360_submit_payment",
        "CANCEL_AND_REFLOW": "order360_cancel_and_reflow",
    }.get(action, "order360_action")


def _read_json(path: Path) -> object:
    return json.loads(path.read_text(encoding="utf-8"))
