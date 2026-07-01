from __future__ import annotations

from payflow.models import (
    EligibilityResult,
    GatewayStatus,
    Order,
    OrderState,
    PaymentEvent,
    TraceLine,
)


def verizon_order(raw: dict) -> Order:
    return Order(
        cart_id=raw["cart_id"],
        carrier_id="verizon",
        channel=raw["channel"],
        order_number=raw["order_number"],
        mtn=raw["mtn"],
        location_code=raw["location_code"],
        master_order_number=raw["master_ord_no"],
        stack_id=raw["nsa_stack_id"],
        app_number=raw["app_num"],
        amount_due=float(raw["amount_due"]),
        amount_paid=float(raw["amount_paid"]),
        status=raw["status"],
        created_ts=raw["created_ts"],
        error_type=raw["error_type"],
        raw=raw,
    )


def verizon_payment(raw: dict) -> PaymentEvent:
    return PaymentEvent(
        cart_id=raw["cart_id"],
        attempt_no=int(raw["attempt_no"]),
        gateway_status=GatewayStatus(raw["gateway_status"]),
        auth_amount=float(raw["auth_amount"]),
        posted_to_order=bool(raw["posted_to_order"]),
        gateway_response=raw["gateway_response"],
        ts=raw["ts"],
        raw=raw,
    )


def verizon_state(raw: dict) -> OrderState:
    return OrderState(
        order_number=raw["order_number"],
        status_code=raw["eo_stat_cd"],
        reason_code=raw["eo_stat_rsn_cd"],
        pending_order_number=raw.get("pending_order_number"),
        raw=raw,
    )


def carrier_b_order(raw: dict) -> Order:
    return Order(
        cart_id=raw["basket_ref"],
        carrier_id="carrier_b",
        channel=raw["sales_motion"],
        order_number=raw["oms_order_id"],
        mtn=raw["subscriber_ref"],
        location_code=raw["store_code"],
        master_order_number=raw["parent_order_id"],
        stack_id=raw["bundle_id"],
        app_number=raw["application_ref"],
        amount_due=float(raw["balance_due"]),
        amount_paid=float(raw["captured_amount"]),
        status=raw["basket_state"],
        created_ts=raw["created_at"],
        error_type=raw["failure_label"],
        raw=raw,
    )


def carrier_b_payment(raw: dict) -> PaymentEvent:
    return PaymentEvent(
        cart_id=raw["basket_ref"],
        attempt_no=int(raw["try_index"]),
        gateway_status=GatewayStatus(raw["processor_state"]),
        auth_amount=float(raw["authorized_value"]),
        posted_to_order=bool(raw["ledger_posted"]),
        gateway_response=raw["processor_message"],
        ts=raw["created_at"],
        raw=raw,
    )


def carrier_b_state(raw: dict) -> OrderState:
    return OrderState(
        order_number=raw["oms_order_id"],
        status_code=raw["ord_status_code"],
        reason_code=raw["hold_reason_code"],
        pending_order_number=raw.get("blocking_order_ref"),
        raw=raw,
    )


def trace_line(raw: dict) -> TraceLine:
    return TraceLine(
        cart_id=raw["cart_id"],
        ts=raw["ts"],
        service=raw["service"],
        level=raw["level"],
        message=raw["message"],
        raw=raw,
    )


def carrier_b_trace_line(raw: dict) -> TraceLine:
    return TraceLine(
        cart_id=raw["basket_ref"],
        ts=raw["created_at"],
        service=raw["component"],
        level=raw["severity"],
        message=raw["text"],
        raw=raw,
    )


def eligibility_from_raw(raw: dict) -> EligibilityResult:
    detail = raw.get("pendingOrderDetail") or {}
    return EligibilityResult(
        pending=bool(raw.get("inEligibility", {}).get("pendingOrder"))
        or bool(detail.get("pendingOrderNumber")),
        pending_order_number=detail.get("pendingOrderNumber"),
        raw=raw,
    )
