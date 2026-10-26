# NeuroWatch

A personal, installable web app tracking clinical neuropsychology research and UK practice
developments, with a dedicated motor neurone disease section.

- **Research** — new studies, filterable by topic.
- **Practice** — UK law, guidance and services (Latest + Tracker).
- **MND** — cognition and behaviour, trials, services and science (Latest + Trial pipeline).
- **Ahead** — conferences, decision dates, deadlines and expected readouts.

Content lives in `feed.json` and is refreshed every Monday by a scheduled Claude run
following `MAINTAINING.md`. The app caches itself and the last feed, so it works offline.

## Install on iPhone

Open the GitHub Pages URL in **Safari** → Share → **Add to Home Screen**.

## Hosting

GitHub Pages, deployed from the `main` branch root.

Summaries are AI-assisted and may contain errors. Not clinical guidance — always check the
original source.
