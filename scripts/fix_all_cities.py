#!/usr/bin/env python3
"""
Download geonames country files and generate SQL to fix alt_names_ru
for all cities in RF and CIS countries.

Usage: python3 fix_all_cities.py > migration.sql
"""

import subprocess
import sys
import zipfile
import io

COUNTRIES = ['RU', 'KZ', 'BY', 'UA', 'UZ', 'AZ', 'AM', 'GE', 'KG', 'TJ', 'TM', 'MD']
GEONAMES_URL = 'https://download.geonames.org/export/dump'

# Manual overrides for cities where the extraction algorithm picks the wrong name.
# These are edge cases where transliteration alone is ambiguous.
MANUAL_OVERRIDES = {
    # Russia
    498817: 'Санкт-Петербург',    # Saint Petersburg
    501175: 'Ростов-на-Дону',     # Rostov-on-Don
    1503901: 'Кемерово',          # Kemerovo
    # Minor corrections for cities where the algorithm might pick minority-language forms
    514171: 'Орск',               # Orsk (not Орски)
    472278: 'Волжский',           # Volzhskiy (already fixed, just being safe)
    # Common problematic patterns
}

# Cities where we want to explicitly exclude certain names (historical or wrong forms)
EXCLUDED_NAMES = {
    1496747: ['Новониколаевск'],   # Novosibirsk - historical name
    2022890: ['Хабаровскай'],      # Khabarovsk - non-standard form
}

# Standard Russian Cyrillic characters
RUSSIAN_LETTERS = set()
RUSSIAN_LETTERS.add(chr(0x0401))
for c in range(0x0410, 0x0430):
    RUSSIAN_LETTERS.add(chr(c))
for c in range(0x0430, 0x0450):
    RUSSIAN_LETTERS.add(chr(c))
RUSSIAN_LETTERS.add(chr(0x0451))

ALLOWED_EXTRA = {'-', ' ', '.'}

CYR_TO_LAT = {
    'А': 'a', 'Б': 'b', 'В': 'v', 'Г': 'g', 'Д': 'd', 'Е': 'e', 'Ё': 'yo',
    'Ж': 'zh', 'З': 'z', 'И': 'i', 'Й': 'y', 'К': 'k', 'Л': 'l', 'М': 'm',
    'Н': 'n', 'О': 'o', 'П': 'p', 'Р': 'r', 'С': 's', 'Т': 't', 'У': 'u',
    'Ф': 'f', 'Х': 'kh', 'Ц': 'ts', 'Ч': 'ch', 'Ш': 'sh', 'Щ': 'shch',
    'Ъ': '', 'Ы': 'y', 'Ь': '', 'Э': 'e', 'Ю': 'yu', 'Я': 'ya',
    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo',
    'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
    'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
    'ф': 'f', 'х': 'kh', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'shch',
    'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya',
}

# Non-Russian Cyrillic words/particles from Turkic, Uralic, Mongolic languages
# These are city suffixes or words that don't exist in Russian
NON_RU_PATTERNS = [
    ' ош', ' хот', ' кала', ' бал', 'дагъы', 'дохи',
    'донын', 'дондагъы', 'тӱб', 'ӱмбалне', 'ӱмбал',
    ' олыж', 'Виль ', 'Од ', 'Сибиркар', 'Чилобин',
    ' ош.', ' балһсн', 'дондохи',
]

# Russian city name suffixes (typical endings)
RU_CITY_SUFFIXES = [
    'ск', 'цк', 'жск', 'шск', 'чск', 'щск',
    'град', 'бург', 'горск', 'поль', 'город',
    'водск', 'знь', 'сть', 'вь', 'брь', 'брь',
    'нск', 'рск', 'тск', 'вск', 'льск',
]


def is_russian(name):
    if not name:
        return False
    has_cyrillic = False
    for ch in name:
        if ch in RUSSIAN_LETTERS:
            has_cyrillic = True
        elif ch not in ALLOWED_EXTRA:
            return False
    return has_cyrillic


def transliterate_cyr_to_lat(name):
    result = []
    for ch in name:
        result.append(CYR_TO_LAT.get(ch, ch))
    return ''.join(result)


def has_non_russian_pattern(name):
    name_lower = name.lower()
    for pat in NON_RU_PATTERNS:
        if pat.lower() in name_lower:
            return True
    return False


def has_russian_city_suffix(name):
    name_lower = name.lower()
    last_word = name_lower.split(' ')[-1].split('-')[-1]
    for suffix in RU_CITY_SUFFIXES:
        if last_word.endswith(suffix):
            return True
    return False


# Region/administrative names that should not be treated as city names
REGION_WORDS = ['область', 'край', 'республика', 'автоном', 'округ', 'район',
                'губерния', 'уезд', 'волость', 'станица', 'село', 'деревня']


def is_region_name(name):
    """Check if name contains region/administrative words."""
    name_lower = name.lower()
    for word in REGION_WORDS:
        if word in name_lower:
            return True
    return False


def extract_russian_name(geonameid, english_name, alternatenames):
    # Check manual override first
    gid = int(geonameid)
    if gid in MANUAL_OVERRIDES:
        return MANUAL_OVERRIDES[gid]

    if not alternatenames:
        return None

    candidates = []
    excluded = EXCLUDED_NAMES.get(gid, [])

    for name in alternatenames.split(','):
        name = name.strip()
        if name and is_russian(name) and not has_non_russian_pattern(name) and not is_region_name(name):
            if name not in excluded:
                candidates.append(name)

    if not candidates:
        return None

    # Remove abbreviation-like candidates
    no_abbrev = [n for n in candidates if n.count('.') < len(n) * 0.2]
    if no_abbrev:
        candidates = no_abbrev

    if len(candidates) == 1:
        return candidates[0]

    eng_clean = english_name.lower().replace(' ', '').replace('-', '')
    eng_len = len(eng_clean)

    def score(name):
        s = 0
        ru_lat = transliterate_cyr_to_lat(name)
        ru_clean = ru_lat.replace(' ', '').replace('-', '')

        # Phonetic match: compare prefixes
        if ru_clean[:4] == eng_clean[:4]:
            s += 120
        elif ru_clean[:3] == eng_clean[:3]:
            s += 100
        elif ru_clean[:2] == eng_clean[:2]:
            s += 50

        # Russian city suffix bonus
        if has_russian_city_suffix(name):
            s += 30

        # Length similarity (normalize: ignore soft/hard signs in comparison)
        name_normalized_len = len(name.replace('ь', '').replace('ъ', ''))
        eng_normalized_len = len(english_name.replace("'", ''))
        norm_diff = abs(name_normalized_len - eng_normalized_len)
        s += max(0, 25 - norm_diff * 5)

        # Proper length for a city name
        if 4 <= len(name) <= 20:
            s += 5

        # Multi-word/hyphenated names (official full names)
        if (' ' in name or '-' in name) and len(name) <= 25:
            s += 3

        # Boost for standard Russian soft-sign ending
        if name.endswith('ь'):
            s += 12

        # Penalty for very long names (likely descriptive, not the main city name)
        if len(name) > 25:
            s -= 20

        return s

    candidates.sort(key=score, reverse=True)
    return candidates[0]


def download_country(country_code):
    url = f'{GEONAMES_URL}/{country_code}.zip'
    print(f'-- Downloading {country_code}...', file=sys.stderr)

    result = subprocess.run(
        ['curl', '-sL', '--connect-timeout', '30', '--max-time', '120', url],
        capture_output=True,
        timeout=130,
    )

    if result.returncode != 0:
        print(f'-- ERROR: Failed to download {country_code}', file=sys.stderr)
        return None

    try:
        with zipfile.ZipFile(io.BytesIO(result.stdout)) as z:
            txt_file = f'{country_code}.txt'
            if txt_file not in z.namelist():
                print(f'-- ERROR: {txt_file} not found for {country_code}', file=sys.stderr)
                return None
            return z.read(txt_file).decode('utf-8', errors='replace')
    except Exception as e:
        print(f'-- ERROR processing {country_code}: {e}', file=sys.stderr)
        return None


def main():
    total = 0

    print("-- Fix alt_names_ru for ALL RF and CIS cities")
    print("-- Generated from geonames.org source data")
    print()

    for country in COUNTRIES:
        content = download_country(country)
        if content is None:
            continue

        count = 0
        for line in content.split('\n'):
            line = line.strip()
            if not line:
                continue
            parts = line.split('\t')
            if len(parts) < 4:
                continue

            geonameid = parts[0]
            english_name = parts[1]
            alternatenames = parts[3]

            russian_name = extract_russian_name(geonameid, english_name, alternatenames)
            if russian_name:
                safe_name = russian_name.replace("'", "''")
                print(f"UPDATE public.geonames_cities SET alt_names_ru = '{safe_name}' WHERE id = {geonameid};")
                count += 1

        print(f'-- {country}: {count} cities updated', file=sys.stderr)
        total += count

    print(f'-- Total: {total} cities updated', file=sys.stderr)


if __name__ == '__main__':
    main()
