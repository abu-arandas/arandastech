#!/usr/bin/env bash
# Keeps the layers in ARCHITECTURE.md apart, and the app on real data:
#
#   * lib/models and lib/services import neither GetX nor Flutter (rule 1);
#   * lib/models imports no services, controllers, bindings, views or widgets;
#   * lib holds no stand-in backend (a Memory*, Demo*, Fake*, Sample* or Mock* class) (rule 3);
#   * no file in lib is over 400 lines, so each screen and controller stays readable (rule 10).
#
# Prints each offender and fails if there is one.
set -euo pipefail
cd "$(dirname "$0")/.."
bad=0
grep -rnE "^import 'package:(get|flutter|material_ui|url_launcher)/" lib/models lib/services && bad=1
grep -rnE "^(import|export) '(\.\./|package:zirr_owner/)(services|controllers|bindings|views|widgets)/" lib/models && bad=1
grep -rnE "^\s*(abstract |final |base |interface )*class (Memory|Demo|Fake|Sample|Mock)\w*" lib && bad=1
for file in $(find lib -name '*.dart'); do
  lines=$(wc -l < "$file")
  if [ "$lines" -gt 400 ]; then echo "$file has $lines lines (at most 400)"; bad=1; fi
done
if [ "$bad" = 1 ]; then
  echo "Layer check failed: see ARCHITECTURE.md, rules 1, 3 and 10." >&2
  exit 1
fi
echo "ok: models and services are free of GetX and Flutter, models import no other layer, no stand-in data, no file over 400 lines"
