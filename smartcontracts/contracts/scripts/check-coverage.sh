#!/usr/bin/env bash
# Fails if any contract under smartcontracts/contracts/src/ has less
# than 100% line coverage in lcov.info. Interface-only files (no
# executable lines) are skipped — they appear with LF:0 in lcov, which
# we treat as N/A.
set -euo pipefail

lcov="${1:-lcov.info}"
[ -f "$lcov" ] || { echo "missing $lcov" >&2; exit 1; }

awk '
  /^SF:/ {
    sf = substr($0, 4)
    skip = (sf !~ /\/src\//)
    lf = 0; lh = 0; next
  }
  /^LF:/ { lf = substr($0, 4) + 0; next }
  /^LH:/ { lh = substr($0, 4) + 0; next }
  /^end_of_record/ {
    if (!skip && lf > 0) {
      pct = (lh * 100.0) / lf
      printf("%6.2f%%  %4d/%4d  %s\n", pct, lh, lf, sf)
      total_lf += lf; total_lh += lh
      if (lh != lf) { bad++; bad_files[bad] = sf "  " lh "/" lf }
    }
    skip = 0; lf = 0; lh = 0; next
  }
  END {
    if (total_lf > 0) {
      pct = (total_lh * 100.0) / total_lf
      printf("\nTotal: %.2f%%  (%d/%d)\n", pct, total_lh, total_lf)
    }
    if (bad) {
      print "\n✗ Coverage gate FAILED — these src/ files are below 100%:"
      for (i = 1; i <= bad; i++) print "  " bad_files[i]
      exit 1
    }
    print "✓ src/ coverage: 100%"
  }
' "$lcov"
