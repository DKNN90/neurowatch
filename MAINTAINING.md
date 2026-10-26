# Maintaining NeuroWatch

This file is the working spec for the weekly update run (every Monday).
The app is static: **only `feed.json` changes on a normal run.** Don't touch the app code
unless something is broken.

## The reader

A consultant-level clinical neuropsychologist (DClinPsy, QiCN) who specialises in motor
neurone disease and works in the NHS in England. Write for that reader: use correct technical
terms (ECAS, ALS-FTSD, Strong criteria, ALSFRS-R, NfL, SRM, PVT, DoLS, Court of Protection),
skip basics, and report numbers precisely.

## Each run, in order

1. Read `feed.json`. Note `generated_at`: that's the cut-off for "new".
2. Check every source in `sources` for items **since the last `generated_at`**, using web search
   and fetch. Publisher pages often block fetching: when one does, search for the title and use
   PubMed, Europe PMC, the publisher's subject listing (e.g. link.springer.com/subjects/neuropsychology),
   a university press release or an indexed repository instead.
   Also search by name for every open tracker, to catch status changes, and run these searches:
   - ALS OR "motor neurone disease" cognition / behaviour / ECAS / apathy / capacity (past 2 weeks)
   - MND trial results; MND Association research news; UK MND Research Institute
   - clinical neuropsychology new study; neuropsychological assessment; cognitive rehabilitation RCT
   - dementia diagnosis NHS; NICE dementia; brain injury policy UK; mental capacity / DoLS / LPS
   - HCPC practitioner psychologists; BPS Division of Neuropsychology
3. Add relevant items to `updates`. Relevance test:
   - **research** — peer-reviewed studies, meta-analyses, preprints of note and major trial
     launches/results that bear on neuropsychological assessment, formulation, rehabilitation
     or prognosis in adult neurological conditions. Prefer high-quality designs and larger
     samples; aim for 4–8 research items a week, not everything published.
   - **practice** — UK law, court judgments, guidance, NICE decisions, NHS service changes,
     funding programmes, regulator (HCPC) and professional-body (BPS) changes.
   - **mnd** — anything on cognition/behaviour across the ALS–FTD spectrum (always include),
     treatment trials and approvals, UK MND services and guidance, and notable MND science.
   An item that matters to two sections gets one home `section` plus `also: [...]`.
4. Update affected `trackers` (`stage`, `stage_label`, `points`, `timeline` with `done: true`,
   `next`, `links`, `updated` = today). Add a tracker only for a multi-step item the reader
   will want to follow (a guideline in development, a bill, a drug moving through phases).
5. Update `upcoming`: add newly announced conferences, decision dates, consultation closes and
   expected readouts; fix moved dates; remove nothing (the app hides past events).
6. Set each source's `status` to `checked`, or `unreachable` if it couldn't be read this run.
7. Set `generated_at` to now (UTC ISO) and `next_update` to the next Monday.
8. Run `python3 scripts/validate.py`. Fix every ERROR and review every evaluative-word
   warning. Then commit and push to `main`.
9. If more than 200 updates exist, drop the oldest.

## Editorial rules

- **Information only. No editorialising.** No "breakthrough", "promising", "encouraging",
  "landmark", "should", predictions or opinions. Attributed positions are fine when clearly
  attributed ("The MND Association said…", "The authors suggest…").
- **Research items** (`kind: "study"`): `design` gives the design, sample and key measures in
  one or two sentences; `points` gives 2–5 findings with the numbers that matter (n, effect
  sizes, CIs, p-values where reported); `caveats` gives the authors' stated limitations and
  objective design facts (cross-sectional, no control group, self-report, small n). No
  appraisal beyond that.
- **Trials** (`kind: "trial"`): say who reported the result (company, trial team, journal).
  Company and conference data must be labelled as such in `caveats`.
- **Policy** (`kind: "policy"`): `points` = what it says; `who` = who it affects;
  `dates` = key dates.
- If figures come from a press release or news report rather than the paper, say so in
  `caveats`.
- **Plain, precise British English.** `summary` = one or two sentences. Bullets ≤ ~45 words.
- **Never quote more than a short phrase** from any source; paraphrase.
- **Every item needs at least one source link**, with a peer-reviewed or official one wherever
  one exists. Label every link:
  - `peer` — the peer-reviewed article itself (journal site, PubMed, PMC, DOI).
  - `official` — courts, government, NICE, NHS England, MHRA, HCPC, NIH, UKRI, legislation.
  - `secondary` — charities (MND Association, Headway, ARUK), universities, professional
    bodies' news, law firms, established specialist or national press.
  - `preprint` — preprints and conference abstracts.
  - `company` — company press releases and investor material.
  - `lower` — aggregators, trade/finance news, blogs. Only as a pointer.
- **Don't guess.** If a date, number or status can't be confirmed, leave it out or mark the
  timeline item `approx: true`. Where only the month is known, set `date` to a full date for
  sorting and add `date_label` (e.g. "Aug 2026").
- `added` on a new update = today's date. This drives the app's "NEW" badges.
- Political topics (e.g. assisted dying): report votes, stages and dates only.

## Schema reference

See existing entries in `feed.json`.

- Sections: `research`, `practice`, `mnd`. Topic ids are listed under each section and are
  unique across sections; an update may carry topics from any section it appears in.
- Update `kind`: `study`, `trial`, `policy`, `news`.
- Tracker `kind: "guidance"` stages: `proposed`, `consultation`, `development`, `published`,
  `in_effect`, `stalled` (add `reached` with the furthest stage).
- Tracker `kind: "trial"` stages: `preclinical`, `phase1`, `phase2`, `phase3`, `review`,
  `approved`, `stopped` (add `reached`). Trial trackers belong in `mnd` and show in its
  Trial pipeline view.
