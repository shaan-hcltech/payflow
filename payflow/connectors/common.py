from __future__ import annotations

import copy
import json
from pathlib import Path
from typing import Callable

from payflow.connectors.base import OrderSystemConnector
from payflow.models import (
    ActivationDetails,
    ExecutionResult,
    Order,
    OrderState,
    PaymentEvent,
    RemediationAction,
    RootCause,
    TraceLine,
)


class JsonScenarioConnector(OrderSystemConnector):
    def __init__(
        self,
        *,
        carrier_id: str,
        display_name: str,
        data_path: Path,
        order_adapter: Callable[[dict], Order],
        payment_adapter: Callable[[dict], PaymentEvent],
        state_adapter: Callable[[dict], OrderState],
        trace_adapter: Callable[[dict], TraceLine],
    ) -> None:
        self.carrier_id = carrier_id
        self.display_name = display_name
        self._order_adapter = order_adapter
        self._payment_adapter = payment_adapter
        self._state_adapter = state_adapter
        self._trace_adapter = trace_adapter
        self._scenarios = {item["id"]: copy.deepcopy(item) for item in json.loads(data_path.read_text())}
        self._cart_to_id = {
            self._order_adapter(item["cart"]).cart_id: scenario_id
            for scenario_id, item in self._scenarios.items()
        }
        self.execution_log: list[dict] = []

    def _scenario_for_cart(self, cart_id: str) -> dict:
        return self._scenarios[self._cart_to_id[cart_id]]

    def _scenario_for_order(self, order_number: str) -> dict:
        for item in self._scenarios.values():
            if self._order_adapter(item["cart"]).order_number == order_number:
                return item
        raise KeyError(order_number)

    def get_failed_orders(self) -> list[Order]:
        return [self._order_adapter(item["cart"]) for item in self._scenarios.values()]

    def get_order(self, cart_id: str) -> Order:
        return self._order_adapter(self._scenario_for_cart(cart_id)["cart"])

    def get_payment_events(self, cart_id: str) -> list[PaymentEvent]:
        return [self._payment_adapter(item) for item in self._scenario_for_cart(cart_id)["payment_events"]]

    def get_order_state(self, order_number: str) -> OrderState:
        return self._state_adapter(self._scenario_for_order(order_number)["order_state"])

    def get_trace_lines(self, cart_id: str) -> list[TraceLine]:
        return [self._trace_adapter(item) for item in self._scenario_for_cart(cart_id)["traces"]]

    def eligibility_check(self, mtn: str):
        for item in self._scenarios.values():
            order = self._order_adapter(item["cart"])
            if order.mtn == mtn:
                from payflow.connectors.adapter import eligibility_from_raw

                return eligibility_from_raw(item["eligibility"])
        raise KeyError(mtn)

    def pre_validate(self, order_number: str) -> ActivationDetails:
        item = self._scenario_for_order(order_number)
        raw = item["activation_details"]
        return ActivationDetails(
            order_number=order_number,
            activation_status=raw["activationStatus"],
            raw=raw,
        )

    def execute_action(self, order: Order, action: RemediationAction) -> ExecutionResult:
        item = self._scenario_for_cart(order.cart_id)
        self.execution_log.append({"cart_id": order.cart_id, "action": action.value})

        if action in {RemediationAction.ESCALATE, RemediationAction.ESCALATE_NOTIFY}:
            return ExecutionResult(action=action, attempted=False, success=False, message="Escalation action is not executable.")

        attempts = item.setdefault("attempted_actions", [])
        attempts.append(action.value)

        if item.get("remediation_behavior") == "fail_after_reflow" and action == RemediationAction.REFLOW:
            return ExecutionResult(
                action=action,
                attempted=True,
                success=False,
                message="Reflow accepted, but order state remained stuck.",
                raw={"attempt_count": attempts.count(action.value)},
            )

        if action in {RemediationAction.REFLOW, RemediationAction.RESUBMIT_PAYMENT, RemediationAction.RESUBMIT_BALANCE}:
            for payment in item["payment_events"]:
                canonical_payment = self._payment_adapter(payment)
                if canonical_payment.gateway_status.value in {"AUTHORIZED", "PARTIAL", "MISSING"}:
                    self._set_payment_posted(payment, order.amount_due)
            self._set_cart_paid(item["cart"], order.amount_due)
            self._set_recovered(item)
            return ExecutionResult(action=action, attempted=True, success=True, message=f"{action.value} completed.")

        if action == RemediationAction.CANCEL_AND_REFLOW:
            if "pending_order_number" in item["order_state"]:
                item["order_state"]["pending_order_number"] = None
            if "blocking_order_ref" in item["order_state"]:
                item["order_state"]["blocking_order_ref"] = None
            item["eligibility"]["inEligibility"]["pendingOrder"] = False
            item["eligibility"]["pendingOrderDetail"]["pendingOrderNumber"] = None
            self._set_recovered(item)
            return ExecutionResult(action=action, attempted=True, success=True, message="Pending order cancelled and cart reflowed.")

        return ExecutionResult(action=action, attempted=True, success=False, message="Unsupported action.")

    def _set_payment_posted(self, payment: dict, amount_due: float) -> None:
        if "posted_to_order" in payment:
            payment["posted_to_order"] = True
            payment["gateway_status"] = "AUTHORIZED"
            payment["auth_amount"] = max(float(payment.get("auth_amount", 0)), amount_due)
        else:
            payment["ledger_posted"] = True
            payment["processor_state"] = "AUTHORIZED"
            payment["authorized_value"] = max(float(payment.get("authorized_value", 0)), amount_due)

    def _set_cart_paid(self, cart: dict, amount_due: float) -> None:
        if "amount_paid" in cart:
            cart["amount_paid"] = amount_due
        else:
            cart["captured_amount"] = amount_due

    def _set_recovered(self, item: dict) -> None:
        if "status" in item["cart"]:
            item["cart"]["status"] = "RECOVERED"
        else:
            item["cart"]["basket_state"] = "RECOVERED"
        state = item["order_state"]
        if "eo_stat_cd" in state:
            state["eo_stat_cd"] = "COMPLETE"
            state["eo_stat_rsn_cd"] = "RECOVERED"
        else:
            state["ord_status_code"] = "COMPLETE"
            state["hold_reason_code"] = "RECOVERED"

    def expected_root_cause(self, cart_id: str) -> RootCause:
        return RootCause(self._scenario_for_cart(cart_id)["expected_root_cause"])

    def raw_field_examples(self) -> list[dict]:
        first = next(iter(self._scenarios.values()))
        return [
            {"raw": "carrier order id", "field": next(iter(first["cart"].keys()))},
            {"raw": "order status", "field": next(iter(first["order_state"].keys()))},
            {"raw": "payment status", "field": next(iter(first["payment_events"][0].keys()))},
        ]
