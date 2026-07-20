# GridFlow incident response

## Severity

- **SEV-1:** data exposure, cross-organisation access, destructive corruption or widespread unauthorised sending.
- **SEV-2:** production outage, failed authentication, broken agent queue or email automation affecting several users.
- **SEV-3:** isolated feature failure, delayed queue, incorrect AI result caught before use or non-critical integration error.

## First response

1. Stop affected workers or email automation when continued processing could cause harm.
2. Preserve logs, request IDs, release version, commit SHA and affected record IDs.
3. Record the start time, scope and current owner.
4. For suspected data exposure, revoke sessions and integration tokens immediately.
5. For database damage, make a fresh backup before attempting repair when safe.
6. Restore service only after the failure condition and duplicate-action risk are understood.

## Recovery checks

- API readiness succeeds.
- Organisation isolation remains intact.
- Agent and channel queues have no duplicate active jobs.
- Replies, suppression and opt-outs still stop sequences.
- Latest backup checksum passes and a restore path is available.
- Affected users receive a factual update when required.

## After recovery

Document the timeline, root cause, data affected, corrective change, tests added and prevention owner. Never delete operational evidence merely to make the dashboard look healthy.
