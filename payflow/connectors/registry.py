from __future__ import annotations

import json
from pathlib import Path

from payflow.connectors.base import OrderSystemConnector


CARRIER_OPTIONS = {
    "carrier_a": "Carrier A (Order API)",
    "carrier_b": "Carrier B (OMS)",
}


def create_connector(carrier_id: str) -> OrderSystemConnector:
    if carrier_id == "carrier_a":
        from payflow.connectors.carrier_a import CarrierAOrderConnector

        return CarrierAOrderConnector()
    if carrier_id == "carrier_b":
        from payflow.connectors.carrier_b import CarrierBConnector

        return CarrierBConnector()
    raise ValueError(f"Unknown carrier: {carrier_id}")


def load_config(carrier_id: str) -> dict:
    path = Path(__file__).resolve().parents[1] / "config" / f"{carrier_id}.json"
    return json.loads(path.read_text())
