from __future__ import annotations

from pathlib import Path

from payflow.connectors.adapter import carrier_b_order, carrier_b_payment, carrier_b_state, carrier_b_trace_line
from payflow.connectors.common import JsonScenarioConnector


class CarrierBConnector(JsonScenarioConnector):
    def __init__(self) -> None:
        super().__init__(
            carrier_id="carrier_b",
            display_name="Carrier B (OMS)",
            data_path=Path(__file__).resolve().parents[1] / "data" / "carrier_b" / "scenarios.json",
            order_adapter=carrier_b_order,
            payment_adapter=carrier_b_payment,
            state_adapter=carrier_b_state,
            trace_adapter=carrier_b_trace_line,
        )
