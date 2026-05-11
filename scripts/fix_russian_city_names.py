#!/usr/bin/env python3
"""
Extract proper Russian (standard Cyrillic) city names from geonames
alternatenames data and generate SQL to fix the alt_names_ru column.

Usage: python3 fix_city_names.py > output.sql
"""

import subprocess
import sys
import re

COUNTRIES = ['RU', 'KZ', 'BY', 'UA', 'UZ', 'AZ', 'AM', 'GE', 'KG', 'TJ', 'TM', 'MD']
GEONAMES_BASE = 'https://download.geonames.org/export/dump'

# Standard Russian Cyrillic characters (Unicode ranges)
# Ё (U+0401), А-Я (U+0410-U+042F), а-я (U+0430-U+044F), ё (U+0451)
RUSSIAN_CHARS = set()
# Uppercase
RUSSIAN_CHARS.add(chr(0x0401))  # Ё
for c in range(0x0410, 0x0430):
    RUSSIAN_CHARS.add(chr(c))
# Lowercase
for c in range(0x0430, 0x0450):
    RUSSIAN_CHARS.add(chr(c))
RUSSIAN_CHARS.add(chr(0x0451))  # ё

# Allowed non-letter characters in Russian names
ALLOWED_EXTRA = {'-', ' ', '.'}


def is_russian_cyrillic(name: str) -> bool:
    """Check if name consists ONLY of standard Russian Cyrillic characters."""
    if not name:
        return False
    for ch in name:
        if ch not in RUSSIAN_CHARS and ch not in ALLOWED_EXTRA:
            return False
    # Must contain at least one actual Cyrillic letter
    return any(ch in RUSSIAN_CHARS for ch in name)


def extract_russian_name(alternatenames: str):
    """Extract the best Russian name from alternatenames field."""
    if not alternatenames:
        return None

    candidates = []
    for name in alternatenames.split(','):
        name = name.strip()
        if not name:
            continue
        if is_russian_cyrillic(name):
            candidates.append(name)

    if not candidates:
        return None

    # Prefer names without abbreviation periods (like "С.Петербург")
    no_abbrev = [n for n in candidates if '.' not in n or n.count('.') < len(n) * 0.3]
    if no_abbrev:
        candidates = no_abbrev

    # Score each candidate: prefer proper length (not too short, not too long),
    # prefer names starting with uppercase, penalize single-word historical names
    def score(name: str) -> int:
        s = 0
        # Prefer 5-25 chars
        length = len(name)
        if 5 <= length <= 25:
            s += 10
        elif 3 <= length <= 40:
            s += 5
        # Prefer names with spaces (multi-word, more likely the official name)
        if ' ' in name or '-' in name:
            s += 3
        # Penalize single-word names that look like they might be abbreviations
        if length <= 4 and ' ' not in name:
            s -= 2
        return s

    candidates.sort(key=score, reverse=True)
    return candidates[0]


def download_and_process(country_code: str):
    """Download geonames data for a country and extract Russian names.
    Returns list of (geonameid, russian_name, current_english_name)."""
    url = f'{GEONAMES_BASE}/{country_code}.zip'
    print(f'-- Downloading {country_code}...', file=sys.stderr)

    result = subprocess.run(
        ['curl', '-sL', url],
        capture_output=True,
        timeout=60,
    )

    if result.returncode != 0:
        print(f'-- ERROR: Failed to download {country_code}', file=sys.stderr)
        return []

    # Unzip and process
    unzip_result = subprocess.run(
        ['unzip', '-p', '-', f'{country_code}.txt'],
        input=result.stdout,
        capture_output=True,
        timeout=60,
    )

    if unzip_result.returncode != 0:
        print(f'-- ERROR: Failed to unzip {country_code}', file=sys.stderr)
        return []

    results = []
    lines = unzip_result.stdout.decode('utf-8', errors='replace').strip().split('\n')
    for line in lines:
        if not line.strip():
            continue
        parts = line.split('\t')
        if len(parts) < 4:
            continue

        geonameid = parts[0]
        english_name = parts[1]
        alternatenames = parts[3]

        russian_name = extract_russian_name(alternatenames)
        if russian_name:
            try:
                results.append((int(geonameid), russian_name, english_name))
            except ValueError:
                continue

    print(f'-- {country_code}: {len(results)} cities with Russian names extracted', file=sys.stderr)
    return results


def main():
    print("-- Fix Russian city names in alt_names_ru for ALL RF and CIS cities")
    print("-- Generated from geonames.org source data")
    print("BEGIN;")
    print()

    for country in COUNTRIES:
        cities = download_and_process(country)
        for geonameid, russian_name, english_name in cities:
            # Escape single quotes for SQL
            safe_name = russian_name.replace("'", "''")
            print(f"UPDATE public.geonames_cities SET alt_names_ru = '{safe_name}' WHERE id = {geonameid};")
        print(f"-- {country}: {len(cities)} cities")
        print()

    print("COMMIT;")


if __name__ == '__main__':
    main()
