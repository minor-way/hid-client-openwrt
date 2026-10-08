#!/bin/sh
# Size-based rotation of the persistent hiddify log (copy + truncate, the writer keeps its O_APPEND fd).
#   log_rotate.sh          rotate when over log_max_kb
#   log_rotate.sh clear    empty the log and its rotated copy

. /usr/share/hiddify/common.sh

LOG="$(hcfg main log_file /etc/hiddify/log/hiddify.log)"
MAX_KB="$(hcfg main log_max_kb 1024)"

[ -f "$LOG" ] || exit 0

if [ "$1" = clear ]; then
	: > "$LOG"
	rm -f "$LOG.1"
	exit 0
fi

SIZE_KB="$(du -k "$LOG" | cut -f1)"
if [ "${SIZE_KB:-0}" -gt "$MAX_KB" ] 2>/dev/null; then
	cp "$LOG" "$LOG.1" && : > "$LOG"
fi
exit 0
