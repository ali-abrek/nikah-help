#!/usr/bin/env python3
"""
Filter the generated SQL to only include geonameids that exist in the database.
Reads IDs from a file (one per line) and filters SQL from stdin.
"""
import sys
import re

def main():
    if len(sys.argv) < 2:
        print("Usage: python3 filter_sql.py <ids_file> < sql_input > sql_output", file=sys.stderr)
        sys.exit(1)

    ids = set()
    with open(sys.argv[1]) as f:
        for line in f:
            line = line.strip()
            if line:
                ids.add(line)

    print(f"-- Loaded {len(ids)} IDs to filter", file=sys.stderr)

    count = 0
    for line in sys.stdin:
        line_stripped = line.strip()
        if line_stripped.startswith('UPDATE'):
            m = re.search(r'WHERE id = (\d+)', line_stripped)
            if m and m.group(1) in ids:
                print(line_stripped)
                count += 1
        elif line_stripped.startswith('--'):
            print(line_stripped)

    print(f"-- Filtered: {count} UPDATE statements", file=sys.stderr)

if __name__ == '__main__':
    main()
