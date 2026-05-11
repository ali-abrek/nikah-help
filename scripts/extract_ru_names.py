#!/usr/bin/env python3
"""
Extract proper Russian (standard Cyrillic) city names from geonames
alternatenames data and generate SQL to fix the alt_names_ru column.

Reads geonames tab-separated data from stdin.
Outputs SQL UPDATE statements to stdout.

Usage:
  curl -sL https://download.geonames.org/export/dump/RU.zip | funzip | python3 extract_ru_names.py RU
"""

import sys
import re

# Standard Russian Cyrillic characters (Unicode)
# Ё (U+0401), А-Я (U+0410-U+042F), а-я (U+0430-U+044F), ё (U+0451)
RUSSIAN_LETTERS = set()
RUSSIAN_LETTERS.add(chr(0x0401))  # Ё
for c in range(0x0410, 0x0430):
    RUSSIAN_LETTERS.add(chr(c))
for c in range(0x0430, 0x0450):
    RUSSIAN_LETTERS.add(chr(c))
RUSSIAN_LETTERS.add(chr(0x0451))  # ё

ALLOWED_EXTRA = {'-', ' ', '.'}


def is_russian(name):
    """Check if name consists ONLY of standard Russian Cyrillic characters + extra."""
    if not name:
        return False
    has_cyrillic = False
    for ch in name:
        if ch in RUSSIAN_LETTERS:
            has_cyrillic = True
        elif ch not in ALLOWED_EXTRA:
            return False
    return has_cyrillic


def extract_russian_name(alternatenames):
    """Extract the best Russian name from alternatenames field."""
    if not alternatenames:
        return None

    candidates = [n.strip() for n in alternatenames.split(',') if n.strip() and is_russian(n.strip())]

    if not candidates:
        return None

    # Prefer names without abbreviation periods
    no_abbrev = [n for n in candidates if '.' not in n or n.count('.') < len(n) * 0.3]
    if no_abbrev:
        candidates = no_abbrev

    # Score: prefer medium length, multi-word names (official names)
    def score(name):
        s = 0
        length = len(name)
        if 5 <= length <= 25:
            s += 10
        elif 3 <= length <= 40:
            s += 5
        if ' ' in name or '-' in name:
            s += 3
        if length <= 4 and ' ' not in name:
            s -= 2
        return s

    candidates.sort(key=score, reverse=True)
    return candidates[0]


def main():
    country_code = sys.argv[1] if len(sys.argv) > 1 else '??'

    count = 0
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        parts = line.split('\t')
        if len(parts) < 4:
            continue

        geonameid = parts[0]
        alternatenames = parts[3]

        russian_name = extract_russian_name(alternatenames)
        if russian_name:
            safe_name = russian_name.replace("'", "''")
            print(f"UPDATE public.geonames_cities SET alt_names_ru = '{safe_name}' WHERE id = {geonameid};")
            count += 1

    print(f"-- {country_code}: {count} cities", file=sys.stderr)


if __name__ == '__main__':
    main()
