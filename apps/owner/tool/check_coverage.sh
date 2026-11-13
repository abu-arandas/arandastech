#!/usr/bin/env bash
# Fails when line coverage of lib/ in coverage/lcov.info (from `flutter test --coverage`) is under the bar.
# Usage: tool/check_coverage.sh [minimum percent, default 60]
set -euo pipefail
cd "$(dirname "$0")/.."
min="${1:-60}"
awk -F: -v min="$min" '
  /^LF:/ { found += $2 } /^LH:/ { hit += $2 }
  END {
    if (found == 0) { print "no coverage data: run flutter test --coverage first"; exit 1 }
    pct = 100 * hit / found
    printf "line coverage %.1f%% (%d of %d lines), bar %d%%\n", pct, hit, found, min
    exit pct < min
  }' coverage/lcov.info
