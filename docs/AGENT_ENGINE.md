# GridFlow Agent Engine

## Purpose

This milestone turns Atlas, Sage, Relay and Echo from documented prompts into a durable application workflow.

The engine preserves the fixed dependency order:

`Atlas → Sage → Relay → Echo`

Each agent remains independently replaceable and independently retryable.

## Automatic pipeline orchestration

An operator starts the complete workflow from an active Discovery Brief with one action. GridFlow creates a durable `PipelineRun`, queues Atlas, and advances eligible records automatically:

1. Atlas discovers evidenced companies.
2. Sage researches each new or review-needed company.
3. Relay runs only for researched HIGH or MEDIUM priority companies.
4. Echo drafts outreach only for evidenced PRIMARY or SECONDARY contacts with a real contact channel.

Each downstream run retains its own queue job, retry policy, evidence, cost record and audit trail. The pipeline summary reports queued, running, succeeded and failed work across the fan-out. A second click while the same brief is active reuses the existing pipeline rather than creating duplicate work.

Echo stops at draft creation. GridFlow does not send a LinkedIn message, email or call automatically; the relationship moment remains under human control.

## Agent responsibilities

### Atlas

Receives a personalised Discovery Brief and athlete context. It returns genuine company candidates with websites, stable domains, rationale, evidence and confidence. Companies are upserted by the tenant-scoped Company Key.

### Sage

Receives one Atlas company and athlete context. It stores research, evidence, seven 0–5 scores, the exact weighted commercial score, priority, partnership angle and recommended contact roles.

### Relay

Receives a successfully researched company. It returns only contacts supported by public evidence. GridFlow derives the Contact Key, department, priority and preferred channel deterministically rather than trusting AI for those fields.

### Echo

Receives the athlete, company, contact, policy and stored evidence. It creates a new outreach version, LinkedIn copy when a LinkedIn profile exists, email copy only when a genuine email exists, and a call opener in all cases.

## Durable execution

Enqueueing an agent writes all of the following in one database transaction:

- `AgentRun`
- `AutomationJob`
- `JobOutbox`
- the relevant record's processing state
- an audit event

The worker claims one eligible job, updates its heartbeat while running and writes the result transactionally.

Transient failures use exponential retry delays. Exhausted jobs enter `DEAD_LETTER`. Operators can retry failed runs manually. Retrying a failed pipeline run safely reopens its parent pipeline, unless a newer run for the same brief is already active. On startup and every minute, the worker recovers running jobs whose heartbeat has expired. Exhausted stale jobs are failed rather than left permanently stuck.

## Evidence safety

Atlas, Sage and Relay use provider web search. Structured output validation alone is not enough because a model could still place an unrelated URL into a valid JSON object.

The provider therefore includes the source list returned by the web-search tool and compares it with every evidence URL declared in the agent output. A mismatch fails the run before any company, contact or research data is written.

The database stores each evidence item separately with URL, title, supported fact, retrieval time, source type and confidence.

## Cost and telemetry

Each completed run stores:

- provider and model
- prompt version
- input and output tokens
- total tokens
- estimated cost when price settings are supplied
- provider response ID
- start, completion and heartbeat times
- errors and retry count
- related brief, company, contact or outreach record

A `UsageLedger` row feeds dashboard cost reporting.

## Multi-athlete isolation

Every run, job, company, contact, evidence record and outreach record carries a tenant ID. The API sets tenant context before queries, and stable keys are unique within a tenant—not globally. Two athletes can therefore research the same company without seeing or altering each other's private pipeline.

## Validation performed

The automated suite verifies:

- full Atlas → Sage → Relay → Echo execution
- one-action automatic handoffs and duplicate pipeline protection
- company scoring and priority
- evidence and contact persistence
- outreach version and channel actions
- source-provenance matching and rejection
- stale-job requeue and dead-letter behaviour
- database migration and tenant key enforcement
- no duplicate records on stable-key upserts

No live OpenAI research was performed without private credentials.
