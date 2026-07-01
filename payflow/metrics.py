from __future__ import annotations

from payflow.agent import PayFlowAgent
from payflow.connectors.registry import create_connector, load_config
from payflow.models import RunStatus
from payflow.policy import RemediationPolicy


def queue_metrics(connector) -> dict:
    orders = connector.get_failed_orders()
    return {
        "carts": len(orders),
        "amount_at_risk": sum(order.amount_at_risk for order in orders),
        "auto_recoverable": 0,
        "manual_minutes": len(orders) * 12,
    }


def run_batch(carrier_id: str) -> dict:
    connector = create_connector(carrier_id)
    agent = PayFlowAgent(connector, RemediationPolicy(load_config(carrier_id)))
    runs = []
    for order in connector.get_failed_orders():
        inspected = agent.inspect(order.cart_id)
        if inspected.policy and inspected.policy.executor_allowed:
            runs.append(agent.run(order.cart_id, approval="APPROVE"))
        else:
            runs.append(inspected)

    recovered = [run for run in runs if run.status == RunStatus.RECOVERED]
    escalated = [run for run in runs if run.status == RunStatus.ESCALATED]
    amount_recovered = sum(run.order.amount_at_risk for run in recovered)
    return {
        "runs": runs,
        "total": len(runs),
        "recovered": len(recovered),
        "escalated": len(escalated),
        "recovery_rate": len(recovered) / len(runs) if runs else 0,
        "amount_recovered": amount_recovered,
        "minutes_saved": len(recovered) * 12,
        "escalations_avoided": len(recovered),
    }


def impact_projection(daily_carts: int, avg_cart_value: float, manual_minutes: int, recovery_rate: float) -> dict:
    recovered = daily_carts * recovery_rate
    return {
        "daily_recovered_carts": recovered,
        "daily_revenue": recovered * avg_cart_value,
        "weekly_hours_saved": recovered * manual_minutes * 7 / 60,
    }
