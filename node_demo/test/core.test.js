import assert from "node:assert/strict";

import { createStore, getQueue, inspect, runAgent } from "../payflowCore.js";

const tests = [
  ["carrier_a scenarios match expected root cause", () => {
    const store = createStore("carrier_a");
    for (const scenario of store.scenarios) {
      const order = getQueue(store)[store.scenarios.indexOf(scenario)];
      const run = inspect(store, order.cart_id);
      assert.equal(run.diagnosis.root_cause, scenario.expected_root_cause);
    }
  }],
  ["Carrier B scenarios match expected root cause", () => {
    const store = createStore("carrier_b");
    for (const scenario of store.scenarios) {
      const order = getQueue(store)[store.scenarios.indexOf(scenario)];
      const run = inspect(store, order.cart_id);
      assert.equal(run.diagnosis.root_cause, scenario.expected_root_cause);
    }
  }],
  ["declined and credit denied never execute", () => {
    const store = createStore("carrier_a");
    const blocked = new Set(["PAYMENT_DECLINED", "CREDIT_DENIED_HOLD"]);
    for (const scenario of store.scenarios) {
      const order = getQueue(store)[store.scenarios.indexOf(scenario)];
      if (blocked.has(scenario.expected_root_cause)) {
        const run = runAgent(store, order.cart_id, { approval: "APPROVE" });
        assert.equal(run.status, "ESCALATED");
        assert.equal(run.policy.executor_allowed, false);
      }
    }
    assert.deepEqual(store.executionLog, []);
  }],
  ["happy path recovers", () => {
    const store = createStore("carrier_a");
    const run = runAgent(store, "CA-CART-1001", { approval: "APPROVE" });
    assert.equal(run.status, "RECOVERED");
    assert.equal(run.approved_action, "REFLOW");
    assert.equal(run.after_state.status_code, "COMPLETE");
    assert.equal(getQueue(store).some((order) => order.cart_id === "CA-CART-1001"), false);
  }],
  ["retry scenario escalates after two attempts", () => {
    const store = createStore("carrier_a");
    const run = runAgent(store, "CA-CART-1010", { approval: "APPROVE" });
    assert.equal(run.status, "ESCALATED");
    assert.equal(run.execution_results.length, 2);
    assert.ok(run.escalation_packet);
  }]
];

for (const [name, fn] of tests) {
  fn();
  console.log(`ok - ${name}`);
}
