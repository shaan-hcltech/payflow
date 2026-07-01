from __future__ import annotations

from payflow.models import (
    Diagnosis,
    EligibilityResult,
    GatewayStatus,
    Order,
    OrderState,
    PaymentEvent,
    RootCause,
    TraceLine,
)


class DiagnosisEngine:
    def diagnose(
        self,
        *,
        order: Order,
        payments: list[PaymentEvent],
        state: OrderState,
        traces: list[TraceLine],
        eligibility: EligibilityResult,
    ) -> Diagnosis:
        text = " ".join([state.status_code, state.reason_code, *[line.message for line in traces]]).lower()
        evidence: list[str] = []

        if "credit" in text or state.status_code.upper() == "HOLD":
            evidence.extend(["credit or activation hold signal", f"state reason {state.reason_code}"])
            return Diagnosis(
                root_cause=RootCause.CREDIT_DENIED_HOLD,
                confidence=0.96,
                rationale="Credit or activation hold signals make automated payment remediation unsafe.",
                evidence=evidence,
            )

        if any(payment.gateway_status == GatewayStatus.DECLINED for payment in payments):
            evidence.extend(["gateway status declined", "no valid authorization to reuse"])
            return Diagnosis(
                root_cause=RootCause.PAYMENT_DECLINED,
                confidence=0.97,
                rationale="The payment gateway declined the attempt, so the cart must be escalated or customer-notified.",
                evidence=evidence,
            )

        if eligibility.pending or state.pending_order_number or "stale pending" in text:
            evidence.extend(["pending order detected", f"pending order {eligibility.pending_order_number or state.pending_order_number}"])
            return Diagnosis(
                root_cause=RootCause.STALE_PENDING_ORDER_BLOCKING,
                confidence=0.93,
                rationale="Eligibility and order state indicate a stale pending order is blocking completion.",
                evidence=evidence,
            )

        if "timeout" in text or "race" in text:
            evidence.extend(["timeout/race signal in order trace", f"state reason {state.reason_code}"])
            return Diagnosis(
                root_cause=RootCause.GATEWAY_ORDER_TIMEOUT_RACE,
                confidence=0.9,
                rationale="Payment authorization and order posting appear to have raced or timed out across systems.",
                evidence=evidence,
            )

        if not payments or any(payment.gateway_status == GatewayStatus.MISSING for payment in payments) or "submit payment missing" in text or "submit absent" in text:
            evidence.extend(["submit payment event missing", "order is waiting for payment submit"])
            return Diagnosis(
                root_cause=RootCause.SUBMIT_PAYMENT_MISSING,
                confidence=0.92,
                rationale="The cart reached CP2 without a completed submit-payment event.",
                evidence=evidence,
            )

        paid_short = order.amount_paid < order.amount_due or any(payment.gateway_status == GatewayStatus.PARTIAL for payment in payments)
        if paid_short:
            evidence.extend([f"amount paid {order.amount_paid:.2f} is below amount due {order.amount_due:.2f}", "partial authorization signal"])
            return Diagnosis(
                root_cause=RootCause.PARTIAL_SHORT_PAYMENT,
                confidence=0.91,
                rationale="A payment exists, but the captured amount does not cover the order balance.",
                evidence=evidence,
            )

        authorized_not_posted = any(
            payment.gateway_status == GatewayStatus.AUTHORIZED and not payment.posted_to_order
            for payment in payments
        )
        if authorized_not_posted:
            evidence.extend(["payment authorized", "posted_to_order is false", "order remains payment pending"])
            return Diagnosis(
                root_cause=RootCause.PAYMENT_AUTHORIZED_NOT_POSTED,
                confidence=0.94,
                rationale="Payment was authorized but never posted to the order ledger.",
                evidence=evidence,
            )

        evidence.append("fallback matched payment/order completion mismatch")
        return Diagnosis(
            root_cause=RootCause.PAYMENT_AUTHORIZED_NOT_POSTED,
            confidence=0.72,
            rationale="The safest recoverable interpretation is an order ledger synchronization miss.",
            evidence=evidence,
        )
