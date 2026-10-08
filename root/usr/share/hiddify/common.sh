#!/bin/sh
# Shared helpers for the hiddify scripts. Sourced, not executed.

HIDDIFY_DIR=/etc/hiddify
HIDDIFY_RUN=/var/run/hiddify
# shellcheck disable=SC2034
HIDDIFY_SUB="$HIDDIFY_DIR/sub.txt"
HIDDIFY_UA="HiddifyNext/4.0.0(linux) like ClashMeta v2ray sing-box"

hcfg() {
	local v
	v="$(uci -q get "hiddify.$1.$2")"
	echo "${v:-$3}"
}

hlog() {
	logger -t hiddify "$*"
}

# Write a small JSON status file: hstatus <file> <state> <message> [extra "key":value pairs]
hstatus() {
	local file="$1" state="$2" msg="$3" extra="$4"
	mkdir -p "$HIDDIFY_RUN"
	msg="$(printf '%s' "$msg" | sed 's/\\/\\\\/g; s/"/\\"/g' | tr -d '\n\r')"
	printf '{"state":"%s","message":"%s","time":%s%s}\n' \
		"$state" "$msg" "$(date +%s)" "${extra:+,$extra}" > "$file.tmp" && mv "$file.tmp" "$file"
}

hiddify_running() {
	pidof "$(basename "$(hcfg main core_path /usr/bin/hiddify-core)")" >/dev/null 2>&1
}

# hfetch <url> <outfile> [curl args...]: try the normal route (Passwall2 if active) first,
# then through hiddify's own SOCKS port when it is running.
hfetch() {
	local url="$1" out="$2" port
	shift 2
	# TLS handshakes to some hosts get reset at random on filtered links; retrying usually wins
	curl -fsSL --connect-timeout 15 -m 600 --retry 6 --retry-delay 2 --retry-all-errors \
		-A "$HIDDIFY_UA" -o "$out" "$@" "$url" && return 0
	hiddify_running || return 1
	port="$(hcfg main mixed_port 12334)"
	hlog "direct download of $url failed, retrying through socks 127.0.0.1:$port"
	curl -fsSL --connect-timeout 15 -m 600 --retry 3 --retry-delay 2 --retry-all-errors \
		-A "$HIDDIFY_UA" -x "socks5h://127.0.0.1:$port" -o "$out" "$@" "$url"
}
