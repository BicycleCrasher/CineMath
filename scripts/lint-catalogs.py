#!/usr/bin/env python3
"""Catalog lint — finds duplicate items, missing required fields, and JSON errors.

Run manually before committing:
    python3 scripts/lint-catalogs.py

Exits 0 if clean, 1 if any issues found.
"""

import json
import os
import sys
import glob

SKIP_FILES = {'auteur.json', 'catalogs.json'}
REQUIRED_ITEM_FIELDS = ('title', 'year')
REQUIRED_SECTION_FIELDS = ('name', 'items')

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data')


def lint_file(path):
    fname = os.path.basename(path)
    issues = []

    try:
        with open(path) as f:
            data = json.load(f)
    except json.JSONDecodeError as e:
        return [f"{fname}: invalid JSON — {e}"]

    sections = data.get('sections')
    if not isinstance(sections, list):
        return [f"{fname}: missing or invalid 'sections' array"]

    seen = {}
    for sec_idx, sec in enumerate(sections):
        for field in REQUIRED_SECTION_FIELDS:
            if field not in sec:
                issues.append(f"{fname}: section[{sec_idx}] missing '{field}'")
        sec_name = sec.get('name', f'<section {sec_idx}>')
        for item_idx, item in enumerate(sec.get('items', [])):
            label = f"{fname} · '{sec_name}' · item[{item_idx}]"
            for field in REQUIRED_ITEM_FIELDS:
                if field not in item:
                    issues.append(f"{label}: missing '{field}'")
            title = (item.get('title') or '').strip()
            year = item.get('year')
            # Skip duplicate check for placeholder/reference items (year null or 0)
            if title and year:
                key = (title, year)
                if key in seen:
                    issues.append(f"{fname}: duplicate '{title}' ({year}) in '{seen[key]}' and '{sec_name}'")
                else:
                    seen[key] = sec_name
    return issues


def main():
    paths = sorted(glob.glob(os.path.join(DATA_DIR, '*.json')))
    all_issues = []
    for path in paths:
        if os.path.basename(path) in SKIP_FILES:
            continue
        all_issues.extend(lint_file(path))

    if not all_issues:
        print(f"✓ {len(paths) - len(SKIP_FILES)} catalog files clean.")
        return 0

    print(f"✗ {len(all_issues)} issue(s):\n")
    for issue in all_issues:
        print(f"  {issue}")
    return 1


if __name__ == '__main__':
    sys.exit(main())
