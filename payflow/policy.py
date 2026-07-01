from __future__ import annotations

from payflow.models import Diagnosis, PolicyDecision, RemediationAction


class RemediationPolicy:
    def __init__(self, config: dict) -> None:
        self.config = config

    def decide(self, diagnosis: Diagnosis) -> PolicyDecision:
        entry = self.config["actions"][diagnosis.root_cause.value]
        executor_allowed = bool(entry["executor_allowed"])
        autonomy = entry["autonomy"]
        action = RemediationAction(entry["action"])
        safety_reason = (
            "Safety policy blocks executor for declined or credit-denied cases."
            if not executor_allowed
            else "Executor allowed after explicit human approval."
        )
        return PolicyDecision(
            root_cause=diagnosis.root_cause,
            action=action,
            autonomy=autonomy,
            executor_allowed=executor_allowed,
            requires_approval=executor_allowed,
            safety_reason=safety_reason,
        )
