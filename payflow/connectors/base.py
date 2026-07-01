from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any

from payflow.models import (
    ActivationDetails,
    EligibilityResult,
    ExecutionResult,
    Order,
    OrderState,
    PaymentEvent,
    RemediationAction,
    RootCause,
    TraceLine,
)


class OrderSystemConnector(ABC):
    carrier_id: str
    display_name: str

    @abstractmethod
    def get_failed_orders(self) -> list[Order]:
        raise NotImplementedError

    @abstractmethod
    def get_order(self, cart_id: str) -> Order:
        raise NotImplementedError

    @abstractmethod
    def get_payment_events(self, cart_id: str) -> list[PaymentEvent]:
        raise NotImplementedError

    @abstractmethod
    def get_order_state(self, order_number: str) -> OrderState:
        raise NotImplementedError

    @abstractmethod
    def get_trace_lines(self, cart_id: str) -> list[TraceLine]:
        raise NotImplementedError

    @abstractmethod
    def eligibility_check(self, mtn: str) -> EligibilityResult:
        raise NotImplementedError

    @abstractmethod
    def pre_validate(self, order_number: str) -> ActivationDetails:
        raise NotImplementedError

    @abstractmethod
    def execute_action(self, order: Order, action: RemediationAction) -> ExecutionResult:
        raise NotImplementedError

    @abstractmethod
    def expected_root_cause(self, cart_id: str) -> RootCause:
        raise NotImplementedError

    @abstractmethod
    def raw_field_examples(self) -> list[dict[str, Any]]:
        raise NotImplementedError
