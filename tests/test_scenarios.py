from __future__ import annotations

from pathlib import Path

from payflow.agent import PayFlowAgent
from payflow.connectors.registry import create_connector, load_config
from payflow.models import RemediationAction, RootCause, RunStatus
from payflow.policy import RemediationPolicy


def make_agent(carrier_id: str):
    connector = create_connector(carrier_id)
    return connector, PayFlowAgent(connector, RemediationPolicy(load_config(carrier_id)))


def test_verizon_scenarios_match_expected_root_cause():
    connector, agent = make_agent("verizon")
    for order in connector.get_failed_orders():
        run = agent.inspect(order.cart_id)
        assert run.diagnosis is not None
        assert run.diagnosis.root_cause == connector.expected_root_cause(order.cart_id)


def test_carrier_b_scenarios_match_expected_root_cause():
    connector, agent = make_agent("carrier_b")
    for order in connector.get_failed_orders():
        run = agent.inspect(order.cart_id)
        assert run.diagnosis is not None
        assert run.diagnosis.root_cause == connector.expected_root_cause(order.cart_id)


def test_declined_and_credit_denied_never_reach_executor():
    connector, agent = make_agent("verizon")
    blocked = [
        order
        for order in connector.get_failed_orders()
        if connector.expected_root_cause(order.cart_id)
        in {RootCause.PAYMENT_DECLINED, RootCause.CREDIT_DENIED_HOLD}
    ]

    for order in blocked:
        run = agent.run(order.cart_id, approval="APPROVE")
        assert run.status == RunStatus.ESCALATED
        assert run.policy is not None
        assert run.policy.executor_allowed is False
        assert not run.execution_results

    assert connector.execution_log == []


def test_approved_aal_authorized_not_posted_reflows_and_recovers():
    connector, agent = make_agent("verizon")
    run = agent.run("VZ-CART-1001", approval="APPROVE")

    assert run.status == RunStatus.RECOVERED
    assert run.approved_action == RemediationAction.REFLOW
    assert run.after_state is not None
    assert run.after_state.status_code == "COMPLETE"
    assert connector.execution_log == [{"cart_id": "VZ-CART-1001", "action": "REFLOW"}]


def test_still_failing_reflow_retries_once_then_escalates():
    connector, agent = make_agent("verizon")
    run = agent.run("VZ-CART-1010", approval="APPROVE")

    assert run.status == RunStatus.ESCALATED
    assert len(run.execution_results) == 2
    assert [item["action"] for item in connector.execution_log] == ["REFLOW", "REFLOW"]
    assert run.escalation_packet is not None


def test_override_action_is_traceable():
    _, agent = make_agent("verizon")
    run = agent.run("VZ-CART-1001", approval="APPROVE", override_action=RemediationAction.RESUBMIT_PAYMENT)

    assert run.status == RunStatus.RECOVERED
    assert run.approved_action == RemediationAction.RESUBMIT_PAYMENT
    assert any(step.node == "ApprovalGate" and step.output["requested_action"] == "RESUBMIT_PAYMENT" for step in run.steps)


def test_agent_core_has_no_direct_carrier_imports():
    source = (Path(__file__).resolve().parents[1] / "payflow" / "agent.py").read_text().lower()
    assert "connectors.verizon" not in source
    assert "connectors.carrier_b" not in source
