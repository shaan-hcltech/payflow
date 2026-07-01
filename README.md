# PayFlow Recovery Agent

PayFlow Recovery Agent is a local, offline hackathon demo for CP2 payment and order-completion failures. It shows a transparent operations agent that investigates stuck carts, classifies root cause, applies safety policy, pauses for human approval, executes mock Order360-style remediation, verifies recovery, retries once, and escalates with a WFM/Jira-style packet when automation should stop.

## Run JavaScript Frontend + Python Backend

This path uses no third-party Python packages. It serves the clean JavaScript frontend from a standard-library Python backend.

```bash
py -3.11 python_backend/server.py
```

Or through npm:

```bash
npm run start:py
```

Open:

```text
http://localhost:8000
```

Standard-library backend tests:

```bash
py -3.11 -m unittest python_backend/test_backend.py
```

## Run Node Full Stack

The Node version is also dependency-free and serves the same frontend/API shape.

```bash
npm start
```

Open:

```text
http://localhost:4173
```

Node tests:

```bash
npm test
```

## Original Streamlit Run

```bash
pip install -r requirements.txt
streamlit run payflow/app.py
```

Tests:

```bash
pytest
```

## Demo Script

1. Select `Verizon (Order360)`.
2. Choose `VZ-CART-1001 - Order is not fully paid`.
3. Run investigation and show the plan, tool calls, evidence chips, and confidence-scored diagnosis.
4. Approve the recommended `REFLOW`.
5. Show before/after state changing to `COMPLETE / RECOVERED`.
6. Choose a declined or credit-hold cart and show that safety policy routes directly to escalation.
7. Choose `VZ-CART-1010` to show retry once, then escalation.
8. Switch to `Carrier B (OMS)` and run the same core flow on different raw fields.

## Architecture

The core agent never imports a carrier implementation. It depends on the `OrderSystemConnector` interface, canonical Pydantic models, and config-driven remediation policy.

- `payflow/models.py`: canonical order, payment, state, trace, diagnosis, policy, and run records.
- `payflow/connectors/`: carrier adapters and in-memory mock connectors.
- `payflow/diagnosis.py`: deterministic offline diagnosis engine.
- `payflow/policy.py`: root-cause to action mapping loaded from JSON config.
- `payflow/agent.py`: transparent state machine with reasoning steps and tool transcript.
- `payflow/app.py`: clean Streamlit demo UI.

## Add A Carrier

1. Add seed data under `payflow/data/<carrier>/scenarios.json`.
2. Add a config file under `payflow/config/<carrier>.json`.
3. Implement a connector that maps raw carrier fields into the canonical model.
4. Register it in `payflow/connectors/registry.py`.

No agent-core changes are required.
