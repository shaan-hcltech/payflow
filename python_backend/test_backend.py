from __future__ import annotations

import unittest
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parent))
from payflow_backend import create_store, get_queue, inspect, run_agent


class PayFlowBackendTests(unittest.TestCase):
    def test_verizon_scenarios_match_expected_root_cause(self) -> None:
        store = create_store("verizon")
        for scenario in store["scenarios"]:
            order = get_queue(store)[store["scenarios"].index(scenario)]
            run = inspect(store, order["cart_id"])
            self.assertEqual(run["diagnosis"]["root_cause"], scenario["expected_root_cause"])

    def test_carrier_b_scenarios_match_expected_root_cause(self) -> None:
        store = create_store("carrier_b")
        for scenario in store["scenarios"]:
            order = get_queue(store)[store["scenarios"].index(scenario)]
            run = inspect(store, order["cart_id"])
            self.assertEqual(run["diagnosis"]["root_cause"], scenario["expected_root_cause"])

    def test_declined_and_credit_denied_never_execute(self) -> None:
        store = create_store("verizon")
        blocked = {
            "PAYMENT_DECLINED",
            "CREDIT_DENIED_HOLD",
        }
        for scenario in store["scenarios"]:
            order = get_queue(store)[store["scenarios"].index(scenario)]
            if scenario["expected_root_cause"] in blocked:
                run = run_agent(store, order["cart_id"], approval="APPROVE")
                self.assertEqual(run["status"], "ESCALATED")
                self.assertFalse(run["policy"]["executor_allowed"])
        self.assertEqual(store["execution_log"], [])

    def test_happy_path_recovers(self) -> None:
        store = create_store("verizon")
        run = run_agent(store, "VZ-CART-1001", approval="APPROVE")
        self.assertEqual(run["status"], "RECOVERED")
        self.assertEqual(run["approved_action"], "REFLOW")
        self.assertEqual(run["after_state"]["status_code"], "COMPLETE")
        self.assertNotIn("VZ-CART-1001", [order["cart_id"] for order in get_queue(store)])

    def test_retry_scenario_escalates_after_two_attempts(self) -> None:
        store = create_store("verizon")
        run = run_agent(store, "VZ-CART-1010", approval="APPROVE")
        self.assertEqual(run["status"], "ESCALATED")
        self.assertEqual(len(run["execution_results"]), 2)
        self.assertIsNotNone(run["escalation_packet"])


if __name__ == "__main__":
    unittest.main()
