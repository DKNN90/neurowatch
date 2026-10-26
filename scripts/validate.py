#!/usr/bin/env python3
"""Validate feed.json before publishing. Exits non-zero on any error.

Usage: python3 scripts/validate.py [path/to/feed.json]
"""
import json
import re
import sys

SECTIONS = {"research", "practice", "mnd"}
GUIDE_STAGES = {"proposed", "consultation", "development", "published", "in_effect", "stalled"}
TRIAL_STAGES = {"preclinical", "phase1", "phase2", "phase3", "review", "approved", "stopped"}
KINDS = {"study", "trial", "policy", "news"}
QUALITIES = {"peer", "official", "secondary", "preprint", "company", "lower"}
DATE = re.compile(r"^\d{4}(-\d{2}(-\d{2})?)?$")
FULL_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
MAX_UPDATES = 200
BANNED = re.compile(r"\b(breakthrough|game[- ]changer|landmark|groundbreaking|ground-breaking|exciting|promising|welcome[sd]?|disappointing|encouraging|hope(ful)?|miracle)\b", re.I)

errors, warnings = [], []


def err(msg):
    errors.append(msg)


def check_text(where, *texts):
    for t in texts:
        if not t:
            continue
        for s in (t if isinstance(t, list) else [t]):
            m = BANNED.search(str(s))
            if m:
                warnings.append(f"{where}: evaluative word {m.group(0)!r} — rephrase neutrally or attribute it")


def check_links(where, links):
    if not links:
        err(f"{where}: needs at least one source link")
        return
    for i, l in enumerate(links):
        if not l.get("label"):
            err(f"{where}: link {i} missing label")
        url = l.get("url", "")
        if not url.startswith("https://"):
            err(f"{where}: link {i} must be https ({url!r})")
        if l.get("quality") not in QUALITIES:
            err(f"{where}: link {i} quality must be one of {sorted(QUALITIES)}")
    if not any(l.get("quality") in ("peer", "official") for l in links):
        warnings.append(f"{where}: no peer-reviewed or official source link")


def main(path):
    with open(path, encoding="utf-8") as fh:
        feed = json.load(fh)

    for key in ("schema_version", "generated_at", "next_update", "sections", "sources", "trackers", "updates", "upcoming"):
        if key not in feed:
            err(f"top level: missing '{key}'")
    if errors:
        return

    if {s["id"] for s in feed["sections"]} != SECTIONS:
        err("sections: must be exactly research, practice, mnd")
    topics = {t["id"] for s in feed["sections"] for t in s.get("topics", [])}
    if len(topics) != sum(len(s.get("topics", [])) for s in feed["sections"]):
        err("sections: topic ids must be unique across sections")

    tracker_ids = set()
    for t in feed["trackers"]:
        w = f"tracker {t.get('id')}"
        if t.get("id") in tracker_ids:
            err(f"{w}: duplicate id")
        tracker_ids.add(t.get("id"))
        for k in ("name", "short", "stage_label", "summary", "next", "updated"):
            if not t.get(k):
                err(f"{w}: missing {k}")
        if t.get("section") not in SECTIONS:
            err(f"{w}: bad section")
        kind = t.get("kind")
        if kind == "trial":
            if t.get("stage") not in TRIAL_STAGES:
                err(f"{w}: bad trial stage {t.get('stage')!r}")
            if t.get("stage") == "stopped" and t.get("reached") not in TRIAL_STAGES - {"stopped"}:
                err(f"{w}: stopped trials need 'reached' (furthest phase)")
        elif kind == "guidance":
            if t.get("stage") not in GUIDE_STAGES:
                err(f"{w}: bad guidance stage {t.get('stage')!r}")
        else:
            err(f"{w}: kind must be 'trial' or 'guidance'")
        for s in t.get("timeline", []):
            if not DATE.match(str(s.get("date", ""))):
                err(f"{w}: bad timeline date {s.get('date')!r}")
        check_text(w, t.get("summary"), t.get("points"), t.get("next"), t.get("stage_label"))
        check_links(w, t.get("links"))

    ids = set()
    for u in feed["updates"]:
        w = f"update {u.get('id')}"
        if u.get("id") in ids:
            err(f"{w}: duplicate id")
        ids.add(u.get("id"))
        for k in ("source", "type", "title", "summary"):
            if not u.get(k):
                err(f"{w}: missing {k}")
        if u.get("section") not in SECTIONS:
            err(f"{w}: bad section")
        for a in u.get("also", []):
            if a not in SECTIONS or a == u.get("section"):
                err(f"{w}: bad 'also' section {a!r}")
        if u.get("kind") not in KINDS:
            err(f"{w}: kind must be one of {sorted(KINDS)}")
        if not u.get("topics"):
            err(f"{w}: needs at least one topic")
        for tp in u.get("topics", []):
            if tp not in topics:
                err(f"{w}: unknown topic {tp!r}")
        for k in ("date", "added"):
            if not FULL_DATE.match(str(u.get(k, ""))):
                err(f"{w}: {k} must be YYYY-MM-DD")
        if u.get("tracker") not in (None, *tracker_ids):
            err(f"{w}: tracker {u.get('tracker')!r} does not exist")
        check_text(w, u.get("title"), u.get("summary"), u.get("points"))
        check_links(w, u.get("links"))
    if len(feed["updates"]) > MAX_UPDATES:
        err(f"updates: {len(feed['updates'])} items; trim to {MAX_UPDATES} (drop the oldest)")

    for e in feed["upcoming"]:
        w = f"upcoming {e.get('title')!r}"
        if not FULL_DATE.match(str(e.get("date", ""))):
            err(f"{w}: date must be YYYY-MM-DD")
        if e.get("end") and not FULL_DATE.match(str(e["end"])):
            err(f"{w}: end must be YYYY-MM-DD")
        if e.get("section") not in SECTIONS:
            err(f"{w}: bad section")
        if e.get("tracker") not in (None, *tracker_ids):
            err(f"{w}: unknown tracker")
        if e.get("url") and not str(e["url"]).startswith("https://"):
            err(f"{w}: url must be https")

    for s in feed["sources"]:
        if s.get("section") not in SECTIONS:
            err(f"source {s.get('id')}: bad section")
        if s.get("status") not in ("checked", "unreachable"):
            err(f"source {s.get('id')}: status must be checked or unreachable")


if __name__ == "__main__":
    p = sys.argv[1] if len(sys.argv) > 1 else "feed.json"
    try:
        main(p)
    except (OSError, json.JSONDecodeError) as exc:
        err(f"could not read {p}: {exc}")
    for w in warnings:
        print("warning:", w)
    for e in errors:
        print("ERROR:", e)
    print(f"{'FAILED' if errors else 'OK'} — {len(errors)} errors, {len(warnings)} warnings")
    sys.exit(1 if errors else 0)
