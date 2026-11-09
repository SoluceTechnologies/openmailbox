#!/usr/bin/env bash
# Measures cold start and inbox scrolling of an installed release build on a device or emulator.
# The app must already be signed in to a large mailbox, for example the Dovecot server started by
# tools/mail-server/mail-server.sh performance (IMAP on 10.0.2.2:3994 from the Android emulator).
# Usage: tools/android-benchmark.sh [launches] [flings]
set -euo pipefail

package=com.soluce.openmailbox
launches="${1:-10}"
flings="${2:-40}"

read -r width height < <(adb shell wm size | sed -n 's/.*: \([0-9]*\)x\([0-9]*\).*/\1 \2/p' | tail -1)

cold_starts=()
for _ in $(seq "$launches"); do
  adb shell am force-stop "$package"
  sleep 1
  cold_starts+=("$(adb shell am start -W -n "$package/.MainActivity" | sed -n 's/^TotalTime: //p' | tr -d '\r')")
  sleep 2
done
sorted=($(printf '%s\n' "${cold_starts[@]}" | sort -n))
echo "Cold start to first frame: median ${sorted[$((launches / 2))]} ms, best ${sorted[0]} ms, worst ${sorted[${#sorted[@]}-1]} ms"

adb shell am start -W -a android.intent.action.VIEW -d "openmailbox://mailbox/unified" "$package" > /dev/null
sleep 3
adb shell dumpsys gfxinfo "$package" reset > /dev/null
x=$((width / 2))
for _ in $(seq "$flings"); do
  adb shell input swipe "$x" $((height * 3 / 4)) "$x" $((height / 5)) 120
done
adb shell dumpsys gfxinfo "$package" |
  grep -E '^(Total frames rendered|Janky frames|50th percentile|90th percentile|95th percentile|99th percentile)'
