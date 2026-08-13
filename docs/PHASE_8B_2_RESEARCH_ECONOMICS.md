# Phase 8B.2 — Research economics and margin assurance

Phase 8B.2 closes the final commercial-software gap before internal product acceptance. It proves the cost of GridFlow research from real production evidence instead of assuming that token counts alone describe provider spend.

## Per-run telemetry

Every new Atlas, Sage and Relay completion records:

- tenant, agent, provider and model;
- input, output and total tokens;
- provider web-search call count;
- model cost, web-search cost and any other external-provider cost;
- external-provider usage metadata;
- total estimated USD cost, research-credit consumption, retries and timestamp.

`OPENAI_INPUT_COST_PER_MILLION_USD`, `OPENAI_OUTPUT_COST_PER_MILLION_USD` and `OPENAI_WEB_SEARCH_COST_PER_CALL_USD` are required production inputs. Missing unit costs make telemetry incomplete rather than silently presenting a zero estimate.

## Evidence window

Only a platform administrator can start a validation window. The window captures the configured Ultra amount and credits per paid period at that moment. It then counts only successful Atlas, Sage and Relay records created inside the window.

Approval requires:

- at least 100 successful research runs;
- at least 10 successful runs from each of Atlas, Sage and Relay;
- complete provider, model, token, search and cost telemetry on every successful run;
- separately reconciled model, web-search and other-provider spend;
- an evidence note identifying the provider statements and allocation method;
- explicit owner confirmation.

Development fixtures and historical records created before the window do not count.

## Owner dashboard

`/platform/economics` shows sample progress, incomplete telemetry, final failures, retry attempts, searches and tokens. Per-agent reporting includes average, median and 90th-percentile estimated cost plus average web searches and tokens.

Reconciled GBP spend produces:

- average cost per successful research credit;
- cost of 100 and 500 credits;
- projected margin for the captured Ultra offer;
- 750-credit heavy-user cost;
- 1,000-credit worst-reasonable cost.

Provider reconciliation is intentionally separate from telemetry estimates. It is unavailable until the full evidence sample is complete; saving it freezes the window so later runs cannot make the approved spend stale. This captures paid retries, failed calls and provider invoice differences that cannot always be assigned safely to one run.

## Approval and launch control

Approval stores a metrics snapshot and immutable platform audit event, locks the window end time and supersedes any earlier approval. Production Launch Control contains two automated gates: complete unit-cost configuration and an approved research-economics window. Neither gate can be manually waived through the automated-check interface.

Starting and completing the live 100+ run window remains an operational acceptance task. Phase 8B.2 supplies the instrumentation, truthful calculations and fail-closed approval mechanism.
