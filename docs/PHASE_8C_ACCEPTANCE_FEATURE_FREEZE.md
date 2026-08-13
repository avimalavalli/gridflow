# Phase 8C — Product Acceptance Lab and feature freeze

Phase 8C turns internal product testing into release evidence. It does not treat a checklist tick as proof and it does not silently carry acceptance from one build to another. Every journey, result, finding and freeze belongs to the exact configured release version and source commit.

## Acceptance Lab

`/platform/acceptance` is available only to platform administrators. For each internal test journey it records:

- the active test organisation, persona, browser and desktop/mobile/tablet device class;
- a fixed 22-step Core-to-renewal workflow covering access, onboarding, research agents, outreach, opportunity, meeting, proposal, contract, delivery, renewal, Ultra, credits and trusted devices;
- test notes on every non-pending result;
- direct evidence references for Core activation, Atlas, Sage and Relay;
- bugs, friction, confusion, dead ends, unnecessary clicks, performance and accessibility findings;
- explicit resolution or deferral rationale and the responsible platform administrator.

A failed or blocked step blocks its journey. A journey passes only when every step passes or has a recorded not-applicable reason. Critical and high findings attached to a step also fail that step so a serious defect cannot sit beside a misleading green journey.

## Hard freeze gate

The feature set can be frozen only when all of these are true:

1. At least two complete journeys have passed.
2. The passed journeys use at least two distinct internal test organisations.
3. A new Core driver and an Ultra renewal are both represented.
4. Desktop and mobile are both represented.
5. Every finding is resolved or deliberately deferred with a rationale.
6. Phase 8B.2 research economics has owner approval.
7. The running release has an exact configured source commit.

Freeze requires an owner evidence note and records an immutable platform audit event. Any later step or finding change automatically clears the freeze. A different deployed commit receives a new acceptance cycle rather than inheriting evidence from the prior build.

## Launch Control

Production Launch Control now contains an automated `product_feature_freeze` check. It passes only when the exact running release version and source commit have a frozen Phase 8C cycle. The check cannot be manually overridden. Development remains usable, while production fails closed.

## Operational completion

The software and enforcement are built. Phase 8C is operationally complete only after the two real internal journeys run on representative physical devices, every demonstrated product gap is fixed and retested, all findings are resolved or consciously deferred, and the final commit is frozen. Security and privacy/legal work then use that frozen product surface.
