from __future__ import annotations

import sys
from datetime import datetime
from pathlib import Path

import streamlit as st

if __package__ is None or __package__ == "":
    sys.path.append(str(Path(__file__).resolve().parents[1]))

from payflow.agent import PayFlowAgent
from payflow.connectors.registry import CARRIER_OPTIONS, create_connector, load_config
from payflow.metrics import impact_projection, run_batch
from payflow.models import AgentRun, RemediationAction, RunStatus
from payflow.policy import RemediationPolicy


st.set_page_config(page_title="PayFlow Recovery Agent", page_icon=None, layout="wide")


CSS = """
<style>
:root {
  --bg: #f6f7f8;
  --surface: #ffffff;
  --line: #e7e8ea;
  --text: #111318;
  --muted: #69707d;
  --blue: #2563eb;
  --green: #138a53;
  --red: #b42318;
  --amber: #a15c07;
}
.stApp { background: var(--bg); color: var(--text); }
section[data-testid="stSidebar"] { background: #fbfbfc; border-right: 1px solid var(--line); }
h1, h2, h3 { letter-spacing: 0; }
h1 { font-size: 2rem; font-weight: 680; margin-bottom: 0.2rem; }
h2 { font-size: 1.2rem; font-weight: 650; }
h3 { font-size: 1rem; font-weight: 650; }
.block-container { padding-top: 2rem; max-width: 1420px; }
.pf-card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 18px 18px;
  box-shadow: 0 1px 2px rgba(17, 19, 24, 0.04);
}
.pf-banner {
  background: #101318;
  color: white;
  border-radius: 8px;
  padding: 14px 16px;
  font-weight: 600;
}
.pf-muted { color: var(--muted); }
.pf-metric {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 14px 16px;
}
.pf-metric .label { color: var(--muted); font-size: 0.8rem; }
.pf-metric .value { font-size: 1.45rem; font-weight: 700; margin-top: 2px; }
.pf-badge {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 4px 9px;
  font-size: 0.76rem;
  font-weight: 650;
  border: 1px solid var(--line);
  margin-right: 6px;
  margin-bottom: 6px;
}
.pf-badge.green { color: var(--green); background: #ecfdf3; border-color: #c7eed8; }
.pf-badge.red { color: var(--red); background: #fff1f0; border-color: #ffd7d3; }
.pf-badge.amber { color: var(--amber); background: #fff7e6; border-color: #f9dfaa; }
.pf-badge.blue { color: var(--blue); background: #eff6ff; border-color: #cfe0ff; }
.pf-step {
  border-left: 2px solid #d9dce1;
  padding: 0 0 14px 14px;
  margin-left: 6px;
}
.pf-step-title { font-weight: 700; font-size: 0.92rem; }
.pf-step-body { color: var(--muted); font-size: 0.86rem; margin-top: 2px; }
.pf-code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.78rem;
  background: #f4f5f6;
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 9px 10px;
  margin-bottom: 8px;
}
.pf-journey {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}
.pf-node {
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 12px;
  background: #fbfbfc;
  text-align: center;
  font-weight: 650;
}
.pf-node.fail { border-color: #f3b5ad; background: #fff4f2; color: var(--red); }
div[data-testid="stMetric"] {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 12px 14px;
}
.stButton > button {
  border-radius: 8px;
  border: 1px solid #d6d9de;
  font-weight: 650;
}
.stButton > button[kind="primary"] { background: #111318; border-color: #111318; }
</style>
"""
st.markdown(CSS, unsafe_allow_html=True)


def connector_for(carrier_id: str):
    key = f"connector:{carrier_id}"
    if key not in st.session_state:
        st.session_state[key] = create_connector(carrier_id)
    return st.session_state[key]


def agent_for(carrier_id: str):
    connector = connector_for(carrier_id)
    return PayFlowAgent(connector, RemediationPolicy(load_config(carrier_id)))


def metric_card(label: str, value: str) -> None:
    st.markdown(f"<div class='pf-metric'><div class='label'>{label}</div><div class='value'>{value}</div></div>", unsafe_allow_html=True)


def badge(label: str, color: str = "blue") -> str:
    return f"<span class='pf-badge {color}'>{label}</span>"


def run_summary(run: AgentRun) -> None:
    if not run.diagnosis or not run.policy:
        return
    color = "green" if run.policy.executor_allowed else "red"
    st.markdown(
        "".join(
            [
                badge(run.diagnosis.root_cause.value.replace("_", " ").title(), "blue"),
                badge(f"Confidence {run.diagnosis.confidence:.0%}", "green"),
                badge(run.policy.action.value, color),
                badge(run.policy.autonomy.replace("_", " ").title(), "amber" if run.policy.requires_approval else "red"),
            ]
        ),
        unsafe_allow_html=True,
    )
    st.caption(run.diagnosis.rationale)


def render_timeline(run: AgentRun) -> None:
    for step in run.steps:
        st.markdown(
            f"""
            <div class="pf-step">
              <div class="pf-step-title">{step.node}</div>
              <div class="pf-step-body">{step.observation}</div>
            </div>
            """,
            unsafe_allow_html=True,
        )


def render_tool_calls(run: AgentRun) -> None:
    for call in run.tool_calls:
        st.markdown(
            f"<div class='pf-code'>{call.name}({', '.join(f'{k}={v}' for k, v in call.inputs.items())}) -> {call.output}</div>",
            unsafe_allow_html=True,
        )


def state_table(label: str, state) -> None:
    st.markdown(f"**{label}**")
    if state is None:
        st.write("No state captured.")
        return
    st.table(
        [
            {"field": "status_code", "value": state.status_code},
            {"field": "reason_code", "value": state.reason_code},
            {"field": "pending_order_number", "value": state.pending_order_number or "-"},
        ]
    )


def render_journey(run: AgentRun | None) -> None:
    failure = "payment"
    if run and run.diagnosis:
        rc = run.diagnosis.root_cause.value
        if "SUBMIT" in rc:
            failure = "submit"
        elif "CREDIT" in rc or run.status == RunStatus.RECOVERED:
            failure = "activation"
    nodes = [("Cart", "cart"), ("Payment", "payment"), ("Submit", "submit"), ("Activation", "activation")]
    html = "<div class='pf-journey'>"
    for label, key in nodes:
        css = "pf-node fail" if key == failure and (not run or run.status != RunStatus.RECOVERED) else "pf-node"
        html += f"<div class='{css}'>{label}</div>"
    html += "</div>"
    st.markdown(html, unsafe_allow_html=True)


def markdown_packet(run: AgentRun) -> None:
    if not run.escalation_packet:
        return
    text = run.escalation_packet.to_markdown()
    st.download_button("Download escalation packet", text, file_name=f"{run.order.cart_id}-escalation.md")
    st.markdown(text)


def queue_rows(connector) -> list[dict]:
    now = datetime(2026, 7, 1, 9, 0, 0)
    rows = []
    for order in connector.get_failed_orders():
        age_hours = max(1, int((now - order.created_ts).total_seconds() // 3600))
        rows.append(
            {
                "cart_id": order.cart_id,
                "channel": order.channel,
                "error": order.error_type,
                "age": f"{age_hours}h",
                "amount_at_risk": f"${order.amount_at_risk:,.2f}",
            }
        )
    return rows


def demo_options(connector) -> dict[str, str]:
    labels = {}
    for order in connector.get_failed_orders():
        labels[f"{order.cart_id} - {order.error_type}"] = order.cart_id
    return labels


def init_memory() -> None:
    st.session_state.setdefault("memory", {"runs": [], "recovered": 0, "escalated": 0, "rejected": 0})


init_memory()

with st.sidebar:
    st.markdown("### PayFlow")
    carrier_id = st.selectbox("Carrier", list(CARRIER_OPTIONS.keys()), format_func=lambda key: CARRIER_OPTIONS[key])
    connector = connector_for(carrier_id)
    agent = agent_for(carrier_id)
    options = demo_options(connector)
    selected_label = st.selectbox("Demo path", list(options.keys()))
    selected_cart_id = options[selected_label]
    st.divider()
    st.caption("Session memory")
    mem = st.session_state["memory"]
    st.metric("Recovered", mem["recovered"])
    st.metric("Escalated", mem["escalated"])
    st.metric("Rejected", mem["rejected"])

st.markdown("# PayFlow Recovery Agent")
st.markdown(f"<div class='pf-banner'>Active carrier: {connector.display_name}</div>", unsafe_allow_html=True)

orders = connector.get_failed_orders()
amount_at_risk = sum(order.amount_at_risk for order in orders)
col1, col2, col3, col4 = st.columns(4)
with col1:
    metric_card("Stuck carts", f"{len(orders)}")
with col2:
    metric_card("Amount at risk", f"${amount_at_risk:,.0f}")
with col3:
    metric_card("Manual minutes", f"{len(orders) * 12}")
with col4:
    metric_card("Active carrier", connector.carrier_id.replace("_", " ").title())

left, right = st.columns([1.05, 1.35], gap="large")

with left:
    st.markdown("## Queue")
    st.dataframe(queue_rows(connector), hide_index=True, use_container_width=True)

    st.markdown("## Cart")
    selected_order = connector.get_order(selected_cart_id)
    st.markdown(
        f"""
        <div class="pf-card">
          <strong>{selected_order.cart_id}</strong><br>
          <span class="pf-muted">{selected_order.channel} / {selected_order.order_number} / {selected_order.error_type}</span><br><br>
          {badge(f"${selected_order.amount_at_risk:,.2f} at risk", "amber")}
          {badge(selected_order.status, "blue")}
        </div>
        """,
        unsafe_allow_html=True,
    )

    st.markdown("## Journey")
    latest_run = st.session_state.get(f"run:{carrier_id}:{selected_cart_id}")
    render_journey(latest_run)

    st.markdown("## Business Impact")
    daily_carts = st.slider("Daily stuck carts", 50, 5000, 1200, step=50)
    avg_cart_value = st.slider("Average cart value", 25, 1000, 180, step=5)
    manual_minutes = st.slider("Manual minutes per cart", 5, 45, 12)
    recovery_rate = st.slider("Expected recovery rate", 0.1, 0.95, 0.72)
    projection = impact_projection(daily_carts, avg_cart_value, manual_minutes, recovery_rate)
    p1, p2 = st.columns(2)
    p1.metric("Daily recovered", f"{projection['daily_recovered_carts']:,.0f}")
    p2.metric("Weekly hours saved", f"{projection['weekly_hours_saved']:,.0f}")
    st.metric("Daily revenue protected", f"${projection['daily_revenue']:,.0f}")

with right:
    st.markdown("## Agent Console")
    inspect_col, approve_col, reject_col = st.columns([1, 1, 1])
    with inspect_col:
        if st.button("Run investigation", type="primary", use_container_width=True):
            st.session_state[f"run:{carrier_id}:{selected_cart_id}"] = agent.inspect(selected_cart_id)
    current_run = st.session_state.get(f"run:{carrier_id}:{selected_cart_id}")

    override = None
    if current_run and current_run.policy and current_run.policy.executor_allowed:
        override = st.selectbox(
            "Override action",
            [current_run.policy.action, *[action for action in RemediationAction if action not in {current_run.policy.action, RemediationAction.ESCALATE, RemediationAction.ESCALATE_NOTIFY}]],
            format_func=lambda action: action.value,
        )
    with approve_col:
        if st.button("Approve", use_container_width=True, disabled=not current_run or current_run.status != RunStatus.AWAITING_APPROVAL):
            result = agent.run(selected_cart_id, approval="APPROVE", override_action=override)
            st.session_state[f"run:{carrier_id}:{selected_cart_id}"] = result
            st.session_state["memory"]["runs"].append(result)
            st.session_state["memory"]["recovered"] += int(result.status == RunStatus.RECOVERED)
            st.session_state["memory"]["escalated"] += int(result.status == RunStatus.ESCALATED)
    with reject_col:
        if st.button("Reject", use_container_width=True, disabled=not current_run or current_run.status != RunStatus.AWAITING_APPROVAL):
            result = agent.run(selected_cart_id, approval="REJECT")
            st.session_state[f"run:{carrier_id}:{selected_cart_id}"] = result
            st.session_state["memory"]["runs"].append(result)
            st.session_state["memory"]["rejected"] += 1

    current_run = st.session_state.get(f"run:{carrier_id}:{selected_cart_id}")
    if not current_run:
        st.info("Run investigation to open the agent timeline.")
    else:
        run_summary(current_run)
        st.divider()
        t1, t2, t3, t4 = st.tabs(["Reasoning", "Tools", "State", "Escalation"])
        with t1:
            render_timeline(current_run)
            if current_run.diagnosis:
                st.markdown("**Evidence**")
                st.markdown("".join(badge(item, "blue") for item in current_run.diagnosis.evidence), unsafe_allow_html=True)
        with t2:
            render_tool_calls(current_run)
        with t3:
            before, after = st.columns(2)
            with before:
                state_table("Before", current_run.before_state)
            with after:
                state_table("After", current_run.after_state)
            if current_run.execution_results:
                st.markdown("**Execution**")
                st.table([result.model_dump(mode="json") for result in current_run.execution_results])
        with t4:
            if current_run.escalation_packet:
                markdown_packet(current_run)
            else:
                st.write("No escalation packet for this run.")

st.divider()
batch_col, portability_col = st.columns([1, 1], gap="large")
with batch_col:
    st.markdown("## Batch Mode")
    if st.button("Run approved batch simulation"):
        st.session_state[f"batch:{carrier_id}"] = run_batch(carrier_id)
    batch = st.session_state.get(f"batch:{carrier_id}")
    if batch:
        b1, b2, b3, b4 = st.columns(4)
        b1.metric("Recovered", batch["recovered"])
        b2.metric("Escalated", batch["escalated"])
        b3.metric("Recovery rate", f"{batch['recovery_rate']:.0%}")
        b4.metric("Minutes saved", batch["minutes_saved"])
        st.metric("Recovered value", f"${batch['amount_recovered']:,.0f}")

with portability_col:
    st.markdown("## Carrier Abstraction")
    st.table(
        [
            {"canonical": "order_number", "carrier_a": "order_number", "Carrier B": "oms_order_id"},
            {"canonical": "status_code", "carrier_a": "eo_stat_cd", "Carrier B": "ord_status_code"},
            {"canonical": "master_order_number", "carrier_a": "master_ord_no", "Carrier B": "parent_order_id"},
            {"canonical": "stack_id", "carrier_a": "nsa_stack_id", "Carrier B": "bundle_id"},
        ]
    )
