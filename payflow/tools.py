from __future__ import annotations

from payflow.connectors.base import OrderSystemConnector
from payflow.models import Order, RemediationAction


class MockToolLayer:
    """Thin, real-shaped tool facade over the active carrier connector."""

    def __init__(self, connector: OrderSystemConnector) -> None:
        self.connector = connector

    def get_failed_carts(self) -> list[Order]:
        return self.connector.get_failed_orders()

    def db_query(self, entity: str, item_id: str):
        if entity == "cart":
            return self.connector.get_order(item_id)
        if entity == "payment_events":
            return self.connector.get_payment_events(item_id)
        if entity == "order_state":
            return self.connector.get_order_state(item_id)
        raise ValueError(f"Unsupported entity: {entity}")

    def es_trace(self, cart_id: str):
        return self.connector.get_trace_lines(cart_id)

    def eligibility_check(self, mtn: str):
        return self.connector.eligibility_check(mtn)

    def order_api_get_activation_details(self, order_number: str):
        return self.connector.pre_validate(order_number)

    def order_api_reflow(self, order: Order):
        return self.connector.execute_action(order, RemediationAction.REFLOW)

    def order_api_submit_payment(self, order: Order):
        return self.connector.execute_action(order, RemediationAction.RESUBMIT_PAYMENT)

    def order_api_cancel_and_reflow(self, order: Order):
        return self.connector.execute_action(order, RemediationAction.CANCEL_AND_REFLOW)
