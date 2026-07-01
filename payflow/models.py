from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class Channel(str, Enum):
    AAL = "AAL"
    EUP = "EUP"
    FIVE_G = "5G"
    NEW_LINE = "NEW_LINE"
    UPGRADE = "UPGRADE"
    FWA = "FWA"


class GatewayStatus(str, Enum):
    AUTHORIZED = "AUTHORIZED"
    DECLINED = "DECLINED"
    MISSING = "MISSING"
    PARTIAL = "PARTIAL"


class RootCause(str, Enum):
    PAYMENT_AUTHORIZED_NOT_POSTED = "PAYMENT_AUTHORIZED_NOT_POSTED"
    SUBMIT_PAYMENT_MISSING = "SUBMIT_PAYMENT_MISSING"
    PARTIAL_SHORT_PAYMENT = "PARTIAL_SHORT_PAYMENT"
    PAYMENT_DECLINED = "PAYMENT_DECLINED"
    CREDIT_DENIED_HOLD = "CREDIT_DENIED_HOLD"
    GATEWAY_ORDER_TIMEOUT_RACE = "GATEWAY_ORDER_TIMEOUT_RACE"
    STALE_PENDING_ORDER_BLOCKING = "STALE_PENDING_ORDER_BLOCKING"


class RemediationAction(str, Enum):
    REFLOW = "REFLOW"
    RESUBMIT_PAYMENT = "RESUBMIT_PAYMENT"
    RESUBMIT_BALANCE = "RESUBMIT_BALANCE"
    ESCALATE_NOTIFY = "ESCALATE_NOTIFY"
    ESCALATE = "ESCALATE"
    CANCEL_AND_REFLOW = "CANCEL_AND_REFLOW"


class RunStatus(str, Enum):
    AWAITING_APPROVAL = "AWAITING_APPROVAL"
    RECOVERED = "RECOVERED"
    ESCALATED = "ESCALATED"
    REJECTED = "REJECTED"


class Order(BaseModel):
    cart_id: str
    carrier_id: str
    channel: str
    order_number: str
    mtn: str
    location_code: str
    master_order_number: str
    stack_id: str
    app_number: str
    amount_due: float
    amount_paid: float
    status: str
    created_ts: datetime
    error_type: str
    raw: dict[str, Any] = Field(default_factory=dict)

    @property
    def amount_at_risk(self) -> float:
        return max(self.amount_due, self.amount_paid)


class PaymentEvent(BaseModel):
    cart_id: str
    attempt_no: int
    gateway_status: GatewayStatus
    auth_amount: float
    posted_to_order: bool
    gateway_response: str
    ts: datetime
    raw: dict[str, Any] = Field(default_factory=dict)


class OrderState(BaseModel):
    order_number: str
    status_code: str
    reason_code: str
    pending_order_number: str | None = None
    raw: dict[str, Any] = Field(default_factory=dict)


class TraceLine(BaseModel):
    cart_id: str
    ts: datetime
    service: str
    level: str
    message: str
    raw: dict[str, Any] = Field(default_factory=dict)


class EligibilityResult(BaseModel):
    pending: bool
    pending_order_number: str | None = None
    raw: dict[str, Any] = Field(default_factory=dict)


class ActivationDetails(BaseModel):
    order_number: str
    activation_status: str
    raw: dict[str, Any] = Field(default_factory=dict)


class ToolCall(BaseModel):
    name: str
    inputs: dict[str, Any]
    output: dict[str, Any]


class Diagnosis(BaseModel):
    root_cause: RootCause
    confidence: float
    rationale: str
    evidence: list[str]


class PolicyDecision(BaseModel):
    root_cause: RootCause
    action: RemediationAction
    autonomy: str
    executor_allowed: bool
    requires_approval: bool
    safety_reason: str


class ReasoningStep(BaseModel):
    node: str
    inputs: dict[str, Any] = Field(default_factory=dict)
    observation: str
    output: dict[str, Any] = Field(default_factory=dict)
    status: str = "complete"
    ts: datetime = Field(default_factory=datetime.utcnow)


class ExecutionResult(BaseModel):
    action: RemediationAction
    attempted: bool
    success: bool
    message: str
    raw: dict[str, Any] = Field(default_factory=dict)


class EscalationPacket(BaseModel):
    title: str
    summary: str
    cart_context: dict[str, Any]
    evidence: list[str]
    attempted_actions: list[str]
    recommendation: str

    def to_markdown(self) -> str:
        lines = [
            f"# {self.title}",
            "",
            "## Summary",
            self.summary,
            "",
            "## Cart Context",
        ]
        lines.extend(f"- {key}: {value}" for key, value in self.cart_context.items())
        lines.extend(["", "## Evidence"])
        lines.extend(f"- {item}" for item in self.evidence)
        lines.extend(["", "## Attempted Actions"])
        lines.extend(f"- {item}" for item in self.attempted_actions or ["None"])
        lines.extend(["", "## Recommendation", self.recommendation])
        return "\n".join(lines)


class AgentRun(BaseModel):
    order: Order
    steps: list[ReasoningStep]
    tool_calls: list[ToolCall]
    diagnosis: Diagnosis | None = None
    policy: PolicyDecision | None = None
    status: RunStatus
    before_state: OrderState | None = None
    after_state: OrderState | None = None
    execution_results: list[ExecutionResult] = Field(default_factory=list)
    escalation_packet: EscalationPacket | None = None
    approved_action: RemediationAction | None = None
