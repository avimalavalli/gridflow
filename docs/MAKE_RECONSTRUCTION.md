# Make Scenario Reconstruction Decision

## Status

The original Make account could not be recovered on 19 July 2026. The original scenario blueprints and verbatim Sage/Relay prompts are therefore unavailable.

GridFlow will not pretend that reconstructed text is the original text. Each replacement prompt is versioned with provenance `RECONSTRUCTED` and begins at `reconstructed-1.0.0`.

## Source hierarchy used

1. The 27-page GridFlow Commercial OS developer brief.
2. The complete Airtable CSV export supplied by Avi.
3. Existing successful Atlas discovery records.
4. Existing Sage research, scoring, partnership angles and evidence.
5. Existing Relay contacts, titles, notes and stable keys.
6. Existing Echo LinkedIn messages, email behaviour, call openers and generation notes.
7. The documented problems and resolutions from the prototype.

## What is preserved

- Agent names and one-agent-one-responsibility separation.
- Atlas → Sage → Relay → Echo order and dependencies.
- Company, Contact and Outreach stable-key rules.
- Seven-factor scoring formula and High/Medium/Low thresholds.
- Queue eligibility and state-machine intent.
- LinkedIn manual-action boundary.
- Genuine-email-only rule.
- Evidence, no-invention, retry and audit requirements.
- User-specific geography and Discovery Brief generation.
- Configurable outreach order and email automation level.

## What cannot be claimed

- The replacement prompts are not verbatim copies from Make.
- Module-specific Make mappings and internal module IDs are not recoverable.
- Any undocumented prompt phrasing, temperature, model setting or hidden test transformation is unknown.

## Validation method

The reconstructed prompts must be tested against a regression fixture set derived from the Airtable export:

- at least five researched companies;
- at least ten contacts;
- at least five outreach records;
- cases with and without email;
- High and Medium priority companies;
- a Relay case returning fewer contacts than requested;
- duplicate Company, Contact and Outreach keys;
- a forced malformed/unsupported AI result.

A prompt version may only be promoted after schema validation, factual review and comparison against the preserved prototype outputs.
