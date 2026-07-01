from __future__ import annotations

from pathlib import Path

from payflow.connectors.adapter import trace_line, verizon_order, verizon_payment, verizon_state
from payflow.connectors.common import JsonScenarioConnector


class VerizonOrder360Connector(JsonScenarioConnector):
    def __init__(self) -> None:
        super().__init__(
            carrier_id="verizon",
            display_name="Verizon (Order360)",
            data_path=Path(__file__).resolve().parents[1] / "data" / "verizon" / "scenarios.json",
            order_adapter=verizon_order,
            payment_adapter=verizon_payment,
            state_adapter=verizon_state,
            trace_adapter=trace_line,
        )
