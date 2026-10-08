#!/bin/sh
# Install luci-app-hiddify without a package manager (OpenWrt 25.x with apk, or any other build).
#   sh install.sh             install / upgrade (keeps an existing /etc/config/hiddify)
#   sh install.sh uninstall   remove everything this script installed
set -e

DIR="$(cd "$(dirname "$0")" && pwd)"
LIST=/usr/share/hiddify/install.list

if [ "$1" = uninstall ]; then
	[ -f "$LIST" ] || { echo "nothing to uninstall ($LIST missing)"; exit 1; }
	sh "$DIR/prerm" 2>/dev/null || /etc/init.d/hiddify stop 2>/dev/null || true
	while read -r f; do
		[ "$f" = /etc/config/hiddify ] || rm -f "$f"
	done < "$LIST"
	rm -f "$LIST"
	rm -rf /tmp/luci-indexcache* /tmp/luci-modulecache
	/etc/init.d/rpcd restart
	echo "luci-app-hiddify removed (kept /etc/config/hiddify, /etc/hiddify and /usr/bin/hiddify-core)"
	exit 0
fi

[ -d "$DIR/files" ] || { echo "run this from the extracted luci-app-hiddify tarball" >&2; exit 1; }

missing=""
for b in ucode curl nft uci logread; do
	command -v "$b" >/dev/null 2>&1 || missing="$missing $b"
done
[ -x /sbin/rpcd ] || missing="$missing rpcd"
ucode -l uci -l fs -e '1' >/dev/null 2>&1 || missing="$missing ucode-mod-uci/ucode-mod-fs"
[ -f /etc/ssl/certs/ca-certificates.crt ] || missing="$missing ca-bundle"
if [ -n "$missing" ]; then
	echo "missing:$missing" >&2
	echo "install them first, e.g. apk add curl ca-bundle ucode-mod-uci ucode-mod-fs nftables" >&2
	exit 1
fi

cd "$DIR/files"
find . -type f | sed 's|^\.||' > "$DIR/install.list"
find . -type f | while read -r f; do
	dst="${f#.}"
	# conffile: never overwrite the user's settings
	if [ "$dst" = /etc/config/hiddify ] && [ -f "$dst" ]; then
		continue
	fi
	mkdir -p "$(dirname "$dst")"
	cp -p "$f" "$dst"
done
mkdir -p "$(dirname "$LIST")"
cp "$DIR/install.list" "$LIST"

sh "$DIR/postinst"
echo "luci-app-hiddify installed: open LuCI > Services > Hiddify"
