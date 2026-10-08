#!/bin/sh
# Download the subscription into /etc/hiddify/sub.txt, keeping the last good copy.
# Restarts hiddify when the content changed (unless --no-restart).

. /usr/share/hiddify/common.sh

STATUS="$HIDDIFY_RUN/sub.json"
RESTART=1
[ "$1" = "--no-restart" ] && RESTART=0

mkdir -p "$HIDDIFY_RUN" "$HIDDIFY_DIR"
exec 9>"$HIDDIFY_RUN/sub.lock"
flock -n 9 || { echo "another update is running"; exit 1; }

count_nodes() {
	local n
	n="$(grep -c '://' "$1")"
	if [ "$n" -eq 0 ]; then
		n="$(tr -d ' \r\n' < "$1" | base64 -d 2>/dev/null | grep -c '://')"
	fi
	if [ "$n" -eq 0 ]; then
		# sing-box / clash style JSON or YAML profiles
		n="$(grep -cE '"(type|server)"[[:space:]]*:|^[[:space:]]*-[[:space:]]*name:' "$1")"
	fi
	echo "${n:-0}"
}

URL="$(hcfg main sub_url)"
if [ -z "$URL" ]; then
	hstatus "$STATUS" error "No subscription URL configured"
	exit 1
fi

TMP="$HIDDIFY_DIR/sub.txt.new"
rm -f "$TMP"
case "$URL" in
	http://*|https://*)
		hstatus "$STATUS" running "Downloading subscription"
		;;
	*)
		# a single proxy link is used as-is
		printf '%s\n' "$URL" > "$TMP"
		;;
esac
if [ ! -s "$TMP" ] && ! hfetch "$URL" "$TMP"; then
	rm -f "$TMP"
	hstatus "$STATUS" error "Download failed (direct and via hiddify)"
	hlog "subscription download failed"
	exit 1
fi

if [ ! -s "$TMP" ] || head -c 512 "$TMP" | grep -qi '<html'; then
	rm -f "$TMP"
	hstatus "$STATUS" error "Subscription response is empty or HTML"
	hlog "subscription response invalid"
	exit 1
fi

NODES="$(count_nodes "$TMP")"
CHANGED=1
[ -f "$HIDDIFY_SUB" ] && cmp -s "$TMP" "$HIDDIFY_SUB" && CHANGED=0
mv "$TMP" "$HIDDIFY_SUB"
chmod 640 "$HIDDIFY_SUB"
chgrp hiddify "$HIDDIFY_SUB" 2>/dev/null

hstatus "$STATUS" ok "Subscription updated" "\"nodes\":$NODES,\"changed\":$([ $CHANGED = 1 ] && echo true || echo false)"
hlog "subscription updated: $NODES nodes, changed=$CHANGED"

# restart also covers the first download, where start_service bailed out waiting for us.
if [ $RESTART = 1 ] && [ "$(hcfg main enabled 0)" = 1 ] && { [ $CHANGED = 1 ] || ! hiddify_running; }; then
	/etc/init.d/hiddify restart
fi
exit 0
