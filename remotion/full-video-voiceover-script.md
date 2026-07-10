# PayFlow Full Video Voice-Over Script

Target length: under 2 minutes. The timing below matches the `payflow-full-video` Remotion composition.

## 0:00-0:07 - Problem

Imagine a customer completes checkout. The payment looks successful, but the order still gets stuck before completion or activation.

## 0:07-0:18 - Why It Hurts

That creates a real operations problem. Teams have to jump across payment status, order ledger state, trace events, eligibility checks, pending orders, and activation details just to understand what failed.

## 0:18-0:30 - Proposed Solution

PayFlow turns that manual investigation into a transparent recovery agent. It plans the run, gathers evidence, diagnoses the root cause, checks safety, asks for approval, executes only when allowed, and verifies the outcome.

## 0:30-0:42 - Architecture

The architecture is carrier-agnostic. Carrier A Order API and Carrier B OMS use different raw schemas, but adapters map both into one canonical order model. That keeps diagnosis, policy, verification, and escalation logic reusable.

## 0:42-0:54 - Operations Workspace

Now we move into the actual application. On the left, the operator has the carrier switcher, demo path selector, session memory, and reset control. Across the top, they can see stuck carts, dollars at risk, manual minutes, and the active Python runtime. The queue works like a compact operations database where each row can be inspected.

## 0:54-1:08 - Failure Intelligence

The Failure Intelligence panel explains the selected cart. It shows the cart ID, order number, channel, amount at risk, failure domain, root cause, recommended action, and evidence signals. Before the agent runs, it clearly shows what is still pending instead of pretending to know the answer.

## 1:08-1:22 - Business Impact

The Impact Calculator turns the operational workflow into a business case. The sliders let us model daily stuck carts, average cart value, and minutes per cart. Below that, Batch Mode runs the seeded queue simulation and shows recovered carts, recovery rate, minutes saved, and recovered value.

## 1:22-1:36 - Carrier Portability

Carrier Portability is the architecture proof. The UI shows that Carrier A and Carrier B can both connect to the same agent core. Different carrier fields are normalized into the same model, so the recovery logic does not need to be rewritten for every carrier.

## 1:36-1:48 - Agent Inspector

The Agent Inspector is where the agentic behavior becomes visible. The operator can run an investigation, see the AI-recommended action, approve or reject execution, and review the current status. The tabs expose reasoning, tool calls, before-and-after state, and escalation details.

## 1:48-1:56 - Safety And Escalation

The safety layer is the key. PayFlow does not automate every cart. If a case is credit-blocked, declined, or still failing after verification, the agent stops and creates an escalation packet with the evidence needed for follow-up.

## 1:56 Closing

So the value is simple: recover what is safe to recover, prove the result, and escalate the rest with context instead of guesswork.
