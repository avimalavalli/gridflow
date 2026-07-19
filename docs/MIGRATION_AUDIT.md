# Airtable Migration Audit

Generated from the supplied Airtable CSV export. This is a dry run: no records were imported or changed.

## Result

- Rows analysed: **111**
- Ready: **51**
- Repairable with an explicit proposed correction: **50**
- Ambiguous: **0**
- Suspected test records: **2**
- Blocked: **8**

## Important findings

- The CSV export does not include Airtable record IDs. The importer will use deterministic CSV row legacy IDs.
- The Companies CSV contains the duplicate header `Lead Sources copy`; both values are preserved during parsing.
- The legacy `Oppurtunity/Oppurtunities` spelling is detected but will not be carried into the production schema.
- **19 contacts** have a missing Echo Status and can safely be proposed as `NOT_STARTED` after review.
- **6 Discovery Briefs** have an empty Search Theme. GridFlow can propose text from the existing name, region and industry, but the user must approve it before Atlas runs.
- Numerous Contact Keys and four Outreach Keys do not match the stable-key rule. The audit proposes exact deterministic replacements rather than trusting the incorrect values.

## Blocked records

- **Harlequin Teamwear** (Companies, row 4): No valid website, domain or Company Key is available.
- **Crew Clothing** (Companies, row 5): No valid website, domain or Company Key is available.
- **Jon Baker** (Contacts, row 2): Linked company “Crew Clothing” was not found in the Companies export.
- **Naomi Parry** (Contacts, row 3): Contact is not linked to a company.; The export suggests this contact may be outdated or no longer relevant.
- **James Cramp** (Contacts, row 38): Job Title is empty; production Contact requires a title.; Contact Key “alex trimnell|muc-off.com” does not match “james cramp|muc-off.com”.
- **Ashley Blain** (Contacts, row 41): Job Title is empty; production Contact requires a title.; Contact Key “christian sanderson|styrkr.com” does not match “ashley blain|styrkr.com”.
- **-Jon Baker** (Outreach, row 3): Company “Crew Clothing” was not found.; Contact “Jon Baker” could not be matched to “Crew Clothing”.; Echo output has no Call Opener.
- **-Mark Magnesen** (Outreach, row 5): Echo output has no Call Opener.

## Test records held out

- **GridFlow Test Contact** (Contacts, row 50)
- **Gmail Draft Test** (Outreach, row 16)

## Cutover rule

Only records approved through the Migration Centre may enter the production CRM. Blocked and test-suspected rows remain outside the live dataset.
