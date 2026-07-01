from __future__ import annotations

from collections import Counter
from typing import Literal

from payflow.connectors.base import OrderSystemConnector
from payflow.diagnosis import DiagnosisEngine
from payflow.models import (
    AgentRun,
    EscalationPacket,
    ExecutionResult,
    Order,
    OrderState,
    ReasoningStep,
    RemediationAction,
    RunStatus,
    ToolCall,
)
from payflow.policy import RemediationPolicy

Approval = Literal["PENDING", "APPROVE", "REJECT"]


class PayFlowAgent:
    def __init__(self, connector: OrderSystemConnector, policy: RemediationPolicy) -> None:
        self.connector = connector
        self.policy = policy
        self.diagnosis_engine = DiagnosisEngine()

    def inspect(self, cart_id: str) -> AgentRun:
        return self.run(cart_id, approval="PENDING")

    def run(
        self,
        cart_id: str,
        *,
        approval: Approval = "PENDING",
        override_action: RemediationAction | None = None,
    ) -> AgentRun:
        steps: list[ReasoningStep] = []
        tool_calls: list[ToolCall] = []
        order = self.connector.get_order(cart_id)

        steps.append(
            ReasoningStep(
                node="Plan",
                observation="Agent plan prepared for CP2 recovery.",
                output={
                    "plan": [
                        "inspect cart and order state",
                        "read payment events and traces",
                        "check eligibility and pending order signals",
                        "classify root cause with confidence",
                        "apply remediation policy and safety rules",
                        "pause for approval before executable action",
                        "verify after remediation and retry once if needed",
                    ]
                },
            )
        )

        steps.append(
            ReasoningStep(
                node="Intake",
                inputs={"cart_id": cart_id},
                observation=f"Loaded stuck {order.channel} cart from {self.connector.display_name}.",
                output={"order_number": order.order_number, "amount_at_risk": order.amount_at_risk},
            )
        )

        payments = self.connector.get_payment_events(cart_id)
        before_state = self.connector.get_order_state(order.order_number)
        traces = self.connector.get_trace_lines(cart_id)
        eligibility = self.connector.eligibility_check(order.mtn)
        tool_calls.extend(
            [
                ToolCall(name="db_query", inputs={"entity": "cart", "id": cart_id}, output=order.model_dump(mode="json")),
                ToolCall(name="db_query", inputs={"entity": "payment_events", "id": cart_id}, output={"count": len(payments)}),
                ToolCall(name="db_query", inputs={"entity": "order_state", "id": order.order_number}, output=before_state.model_dump(mode="json")),
                ToolCall(name="es_trace", inputs={"cart_id": cart_id}, output={"lines": [line.message for line in traces]}),
                ToolCall(name="eligibility_check", inputs={"mtn": order.mtn}, output=eligibility.model_dump(mode="json")),
            ]
        )
        steps.append(
            ReasoningStep(
                node="ToolInvestigation",
                observation="Gathered payment, order, trace, and eligibility evidence.",
                output={
                    "payment_events": len(payments),
                    "trace_lines": len(traces),
                    "pending_order": eligibility.pending_order_number,
                },
            )
        )

        diagnosis = self.diagnosis_engine.diagnose(
            order=order,
            payments=payments,
            state=before_state,
            traces=traces,
            eligibility=eligibility,
        )
        steps.append(
            ReasoningStep(
                node="Diagnosis",
                observation=diagnosis.rationale,
                output={
                    "root_cause": diagnosis.root_cause.value,
                    "confidence": diagnosis.confidence,
                    "evidence": diagnosis.evidence,
                },
            )
        )

        safety_checks = {
            "declined_payment": diagnosis.root_cause.value == "PAYMENT_DECLINED",
            "credit_or_activation_hold": diagnosis.root_cause.value == "CREDIT_DENIED_HOLD",
            "pending_order": bool(eligibility.pending or before_state.pending_order_number),
            "amount_short": order.amount_paid < order.amount_due,
        }
        steps.append(
            ReasoningStep(
                node="SelfCritiqueSafetyCheck",
                observation="Checked for executor-blocking and higher-risk signals before policy selection.",
                output=safety_checks,
            )
        )

        policy = self.policy.decide(diagnosis)
        steps.append(
            ReasoningStep(
                node="RemediationPolicy",
                observation=policy.safety_reason,
                output=policy.model_dump(mode="json"),
            )
        )

        if not policy.executor_allowed:
            packet = self._packet(order, diagnosis.evidence, [], "Safety policy blocked automated remediation.")
            steps.append(
                ReasoningStep(
                    node="EscalationReport",
                    observation="Generated escalation because the executor is blocked by policy.",
                    output={"title": packet.title},
                )
            )
            return AgentRun(
                order=order,
                steps=steps,
                tool_calls=tool_calls,
                diagnosis=diagnosis,
                policy=policy,
                status=RunStatus.ESCALATED,
                before_state=before_state,
                after_state=before_state,
                escalation_packet=packet,
            )

        selected_action = override_action or policy.action
        steps.append(
            ReasoningStep(
                node="ApprovalGate",
                observation="Human approval is required before executor can act.",
                output={"requested_action": selected_action.value, "approval": approval},
                status="waiting" if approval == "PENDING" else "complete",
            )
        )
        if approval == "PENDING":
            return AgentRun(
                order=order,
                steps=steps,
                tool_calls=tool_calls,
                diagnosis=diagnosis,
                policy=policy,
                status=RunStatus.AWAITING_APPROVAL,
                before_state=before_state,
                after_state=before_state,
                approved_action=selected_action,
            )

        if approval == "REJECT":
            packet = self._packet(order, diagnosis.evidence, [], "Human reviewer rejected automation; route to WFM.")
            steps.append(
                ReasoningStep(
                    node="EscalationReport",
                    observation="Generated escalation after reviewer rejection.",
                    output={"title": packet.title},
                )
            )
            return AgentRun(
                order=order,
                steps=steps,
                tool_calls=tool_calls,
                diagnosis=diagnosis,
                policy=policy,
                status=RunStatus.REJECTED,
                before_state=before_state,
                after_state=before_state,
                escalation_packet=packet,
                approved_action=selected_action,
            )

        activation = self.connector.pre_validate(order.order_number)
        tool_calls.append(
            ToolCall(
                name="order360_get_activation_details",
                inputs={"order_number": order.order_number},
                output=activation.model_dump(mode="json"),
            )
        )
        if activation.activation_status == "DENIED":
            packet = self._packet(order, diagnosis.evidence, [], "Pre-validation returned activationStatus DENIED.")
            steps.append(
                ReasoningStep(
                    node="Executor",
                    observation="Executor refused to act because activation pre-validation failed.",
                    output=activation.model_dump(mode="json"),
                )
            )
            steps.append(
                ReasoningStep(
                    node="EscalationReport",
                    observation="Generated escalation packet after pre-validation refusal.",
                    output={"title": packet.title},
                )
            )
            return AgentRun(
                order=order,
                steps=steps,
                tool_calls=tool_calls,
                diagnosis=diagnosis,
                policy=policy,
                status=RunStatus.ESCALATED,
                before_state=before_state,
                after_state=before_state,
                escalation_packet=packet,
                approved_action=selected_action,
            )

        execution_results: list[ExecutionResult] = []
        after_state = before_state
        for attempt in range(1, 3):
            result = self.connector.execute_action(order, selected_action)
            execution_results.append(result)
            tool_calls.append(
                ToolCall(
                    name=self._tool_name(selected_action),
                    inputs={"order_number": order.order_number, "attempt": attempt},
                    output=result.model_dump(mode="json"),
                )
            )
            steps.append(
                ReasoningStep(
                    node="Executor",
                    observation=result.message,
                    output={"action": selected_action.value, "attempt": attempt, "success": result.success},
                )
            )
            after_state = self.connector.get_order_state(order.order_number)
            recovered = self._is_recovered(after_state)
            steps.append(
                ReasoningStep(
                    node="Verification",
                    observation="Re-read order state after remediation.",
                    output={"status_code": after_state.status_code, "reason_code": after_state.reason_code, "recovered": recovered},
                )
            )
            if recovered:
                return AgentRun(
                    order=order,
                    steps=steps,
                    tool_calls=tool_calls,
                    diagnosis=diagnosis,
                    policy=policy,
                    status=RunStatus.RECOVERED,
                    before_state=before_state,
                    after_state=after_state,
                    execution_results=execution_results,
                    approved_action=selected_action,
                )
            if attempt == 1:
                steps.append(
                    ReasoningStep(
                        node="RetryOrEscalate",
                        observation="Verification did not recover the order; retrying once with the same approved action.",
                        output={"retry_allowed": True},
                    )
                )

        packet = self._packet(
            order,
            diagnosis.evidence,
            [result.action.value for result in execution_results],
            "Automation exhausted one retry; WFM should inspect downstream order posting.",
        )
        steps.append(
            ReasoningStep(
                node="RetryOrEscalate",
                observation="Retry exhausted; routing to escalation.",
                output={"retry_allowed": False},
            )
        )
        steps.append(
            ReasoningStep(
                node="EscalationReport",
                observation="Generated WFM/Jira-style packet with evidence and attempted actions.",
                output={"title": packet.title},
            )
        )
        return AgentRun(
            order=order,
            steps=steps,
            tool_calls=tool_calls,
            diagnosis=diagnosis,
            policy=policy,
            status=RunStatus.ESCALATED,
            before_state=before_state,
            after_state=after_state,
            execution_results=execution_results,
            escalation_packet=packet,
            approved_action=selected_action,
        )

    def _packet(self, order: Order, evidence: list[str], actions: list[str], recommendation: str) -> EscalationPacket:
        return EscalationPacket(
            title=f"PayFlow escalation for {order.cart_id}",
            summary=f"{order.channel} cart {order.cart_id} remains blocked at CP2.",
            cart_context={
                "cart_id": order.cart_id,
                "order_number": order.order_number,
                "channel": order.channel,
                "mtn": order.mtn,
                "amount_at_risk": f"${order.amount_at_risk:,.2f}",
                "error_type": order.error_type,
            },
            evidence=evidence,
            attempted_actions=actions,
            recommendation=recommendation,
        )

    def _is_recovered(self, state: OrderState) -> bool:
        return state.status_code == "COMPLETE" and state.reason_code == "RECOVERED"

    def _tool_name(self, action: RemediationAction) -> str:
        return {
            RemediationAction.REFLOW: "order360_reflow",
            RemediationAction.RESUBMIT_PAYMENT: "order360_submit_payment",
            RemediationAction.RESUBMIT_BALANCE: "order360_submit_payment",
            RemediationAction.CANCEL_AND_REFLOW: "order360_cancel_and_reflow",
        }.get(action, "order360_action")


def summarize_runs(runs: list[AgentRun]) -> dict:
    causes = Counter(run.diagnosis.root_cause.value for run in runs if run.diagnosis)
    return {
        "recovered": sum(run.status == RunStatus.RECOVERED for run in runs),
        "escalated": sum(run.status == RunStatus.ESCALATED for run in runs),
        "rejected": sum(run.status == RunStatus.REJECTED for run in runs),
        "causes": dict(causes),
    }
