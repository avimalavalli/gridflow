# GridFlow Agent Quality Evaluation

Generated: 2026-08-12T05:15:41.470Z

- Fixtures: **8**
- Expected outcomes passed: **8**
- Expected outcomes failed: **0**

## Agent summary

| Agent | Fixtures | Expectations passed | Average score |
|---|---:|---:|---:|
| ATLAS | 2 | 2 | 50 |
| SAGE | 2 | 2 | 50 |
| RELAY | 2 | 2 | 50 |
| ECHO | 2 | 2 | 50 |

## Fixture results

| Fixture | Agent | Expected | Actual | Score | Result |
|---|---|---|---|---:|---|
| atlas-pass-personalised-company | ATLAS | PASS | PASS | 100 | PASS |
| atlas-fail-domain-and-evidence | ATLAS | FAIL | FAIL | 0 | PASS |
| sage-pass-evidence-backed-fit | SAGE | PASS | PASS | 100 | PASS |
| sage-fail-placeholders-and-thin-evidence | SAGE | FAIL | FAIL | 0 | PASS |
| relay-pass-current-contact | RELAY | PASS | PASS | 100 | PASS |
| relay-fail-unsupported-contact | RELAY | FAIL | FAIL | 0 | PASS |
| echo-pass-specific-outreach | ECHO | PASS | PASS | 100 | PASS |
| echo-fail-placeholder-and-length | ECHO | FAIL | FAIL | 0 | PASS |

## Notes

This is a deterministic, offline regression gate. It proves that known strong and weak outputs are classified consistently. It does not replace live acceptance testing against current web evidence and real athlete profiles.
