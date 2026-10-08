#!/bin/sh
# hiddify-core always starts with the "balance" group selected; re-apply the saved choice
# (from the Servers page) or the configured default once the clash API is up.

. /usr/share/hiddify/common.sh

API=http://127.0.0.1:16756
WANT="$(cat "$HIDDIFY_DIR/selected" 2>/dev/null)"
[ -n "$WANT" ] || WANT="$(hcfg main default_server lowest)"

i=0
while ! curl -fs -m 2 -o /dev/null "$API/proxies/select"; do
	i=$((i + 1))
	[ $i -ge 60 ] && exit 1
	sleep 2
done

ALL="$(curl -fs -m 5 "$API/proxies/select" | jsonfilter -e '@.all[*]')"
if ! printf '%s\n' "$ALL" | grep -qxF "$WANT"; then
	hlog "saved server '$WANT' no longer in subscription, using auto"
	WANT=lowest
	printf '%s\n' "$ALL" | grep -qxF "$WANT" || exit 0
fi

BODY="$(printf '%s' "$WANT" | sed 's/\\/\\\\/g; s/"/\\"/g')"
curl -fs -m 5 -X PUT -H 'Content-Type: application/json' -d "{\"name\":\"$BODY\"}" "$API/proxies/select" \
	&& hlog "selected server: $WANT"
