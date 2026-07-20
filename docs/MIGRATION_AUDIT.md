# Airtable Migration Audit

Generated from the supplied prototype CSV export. This repository contains only the generic audit summary; private row-level data and source exports are deliberately excluded.

## Result

- Rows analysed: **111**
- Ready: **51**
- Repairable with an explicit proposed correction: **50**
- Ambiguous: **0**
- Suspected test records: **2**
- Blocked: **8**

## Important findings

- The CSV export did not include Airtable record IDs, so deterministic legacy row identifiers are used.
- Duplicate legacy columns and spelling errors are detected without carrying them into the production schema.
- Missing statuses and stable-key mismatches receive explicit proposed repairs rather than silent changes.
- Incomplete company, contact and outreach records remain blocked until reviewed.
- Test-suspected records remain outside the production CRM.

## Privacy boundary

Company names, contact names, emails, domains, row-level errors and original CSV files are not included in the source package. They remain in the owner's private migration material only.

## Cutover rule

Only records approved through the Migration Centre may enter the production CRM. Blocked and test-suspected rows remain outside the live dataset.
