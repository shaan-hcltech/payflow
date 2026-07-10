# PayFlow Explainer Voice-Over Script

Target length: about 75 seconds.

## Script

PayFlow Recovery Agent is built for a common telecom operations problem: a customer gets through checkout, payment looks authorized, but the order is still stuck before completion or activation.

Today, teams often investigate these carts manually. They check payment status, order ledger state, traces, eligibility, pending orders, and activation details across multiple systems. That slows recovery, hides root cause, and leaves revenue at risk.

PayFlow turns that workflow into a transparent agentic loop. The agent plans the run, intakes the selected cart, calls tools, diagnoses the root cause, performs a self-critique safety check, recommends a remediation, and pauses for human approval before it executes.

The workspace is designed for an operator. The queue shows stuck carts and dollars at risk. Failure intelligence explains the selected cart, root cause, recommended action, and evidence signals. The impact calculator shows revenue protected and weekly hours saved. Batch mode simulates the seeded queue.

The important part is safety. If the cart is declined, credit-blocked, or still failing after verification, the agent does not force automation. It retries once where policy allows, then escalates with a WFM or Jira-style evidence packet.

The same core also works across carriers. Carrier A Order API and Carrier B OMS map into one canonical model, so the diagnosis and remediation loop stay portable.

The result is a demo-ready recovery agent that is deterministic, auditable, and practical: recover what is safe to recover, prove the outcome, and escalate the rest with evidence.

## Recording Notes

- Keep the tone calm and executive-friendly.
- Pause slightly after each sentence.
- If you want a tighter version, skip the sentence beginning with “The workspace is designed for an operator.”
- If you want a more technical version, emphasize “canonical model,” “tool transcript,” and “post-action verification.”
