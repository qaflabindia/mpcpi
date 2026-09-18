#!/usr/bin/env bash
# run.sh — open the MPCPI extension in Chrome.
#
# Chrome 137+ ignores --load-extension, and the override flag was removed too,
# so no command line can side-load an unpacked extension any more. The last step
# has to be a click. This script removes every other step: it creates a separate
# Chrome profile with Developer mode already switched on, opens it straight at
# chrome://extensions, and puts the extension path on your clipboard so the file
# dialog is a paste rather than a hunt.
#
# Your normal Chrome, its profile and its sessions are untouched.
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXT="$DIR/extension"
PROFILE="${MPCPI_PROFILE:-$HOME/.mpcpi-chrome}"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

[ -d "$EXT" ] || { echo "extension/ not found at $EXT"; exit 1; }
[ -x "$CHROME" ] || { echo "Google Chrome not found at $CHROME"; exit 1; }
[ -f "$EXT/panel/tailwind.css" ] || { echo "Building CSS…"; (cd "$DIR" && npm run build:css); }

# Pre-enable Developer mode so the "Load unpacked" button is there on arrival.
mkdir -p "$PROFILE/Default"
python3 - "$PROFILE/Default/Preferences" <<'PY'
import json, os, sys
p = sys.argv[1]
try:
    prefs = json.load(open(p))
except Exception:
    prefs = {}
prefs.setdefault("extensions", {}).setdefault("ui", {})["developer_mode"] = True
prefs.setdefault("browser", {})["has_seen_welcome_page"] = True
json.dump(prefs, open(p, "w"))
PY

printf '%s' "$EXT" | pbcopy 2>/dev/null && CLIP="yes" || CLIP=""
# Reveal the extension folder so it can simply be dragged onto the extensions
# page. The folder Chrome needs is the one CONTAINING manifest.json, which is
# extension/ and not the repository root — picking the root is the easiest
# mistake to make here and produces a bare "Could not load manifest" error.
open -R "$EXT" 2>/dev/null || true

pkill -f "user-data-dir=$PROFILE" 2>/dev/null || true
sleep 1

"$CHROME" --user-data-dir="$PROFILE" --no-first-run --no-default-browser-check \
  --new-window "chrome://extensions" >/dev/null 2>&1 &

cat <<MSG

Chrome is open on chrome://extensions with Developer mode already on, and Finder
is showing the folder you need, highlighted.

  EASIEST   drag the highlighted "extension" folder from Finder onto the
            Chrome extensions page. That is the whole installation.

  OR        click "Load unpacked", then Cmd+Shift+G, paste, Enter, Open.
            ${CLIP:+The path is already on your clipboard:}
              $EXT

  Pick the folder that CONTAINS manifest.json. That is  .../mpcpi/extension  —
  NOT  .../mpcpi . Selecting the repository root gives you
  "Manifest file is missing or unreadable".

Then: open any ordinary web page, press Alt+Shift+M (or click the MPCPI toolbar
icon) for the floating panel, and click "Load sample data" on the Data tab.

Chrome removed command-line extension loading in version 137, so that drop or
click is the one step I cannot do for you. Everything else is done.

MSG
