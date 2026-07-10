from __future__ import annotations

from pathlib import Path

from payflow.connectors.adapter import trace_line, carrier_a_order, carrier_a_payment, carrier_a_state
from payflow.connectors.common import JsonScenarioConnector


class CarrierAOrderConnector(JsonScenarioConnector):
    def __init__(self) -> None:
        super().__init__(
            carrier_id="carrier_a",
            display_name="Carrier A (Order API)",
            data_path=Path(__file__).resolve().parents[1] / "data" / "carrier_a" / "scenarios.json",
            order_adapter=carrier_a_order,
            payment_adapter=carrier_a_payment,
            state_adapter=carrier_a_state,
            trace_adapter=trace_line,
        )
