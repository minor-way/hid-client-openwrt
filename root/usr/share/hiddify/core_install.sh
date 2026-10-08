#!/bin/sh
# Install or update the hiddify-core binary from GitHub releases.
#   core_install.sh [version]   install "latest" (default) or a tag such as v4.1.0
#   core_install.sh check       print the latest release tag
#   core_install.sh asset       print the asset name picked for this router

. /usr/share/hiddify/common.sh

REPO=hiddify/hiddify-core
STATUS="$HIDDIFY_RUN/core.json"

detect_asset() {
	local override arch
	override="$(hcfg main core_asset auto)"
	if [ "$override" != auto ]; then
		echo "$override"
		return
	fi
	# shellcheck disable=SC1091
	arch="$(. /etc/openwrt_release; echo "$DISTRIB_ARCH")"
	case "$arch" in
		aarch64*)        echo linux-arm64-musl ;;
		arm_cortex-a5*|arm_cortex-a7*|arm_cortex-a8*|arm_cortex-a9*|arm_cortex-a15*|arm_cortex-a17*)
		                 echo linux-armv7-musl ;;
		arm_arm1176*)    echo linux-armv6 ;;
		arm_*)           echo linux-armv5 ;;
		x86_64)          echo linux-amd64-musl ;;
		i386*)           echo linux-386-musl ;;
		mipsel*)         echo linux-mipsle-softfloat ;;
		mips64el*)       echo linux-mips64le-softfloat ;;
		mips64*)         echo linux-mips64-softfloat ;;
		mips*)           echo linux-mips-softfloat ;;
		riscv64*)        echo linux-riscv64 ;;
		*)               echo "" ;;
	esac
}

latest_tag() {
	local tmp tag
	tmp="$(mktemp)"
	if hfetch "https://api.github.com/repos/$REPO/releases/latest" "$tmp"; then
		tag="$(jsonfilter -i "$tmp" -e '@.tag_name' 2>/dev/null)"
	fi
	rm -f "$tmp"
	echo "$tag"
}

case "$1" in
	check) latest_tag; exit 0 ;;
	asset) detect_asset; exit 0 ;;
esac

mkdir -p "$HIDDIFY_RUN"
exec 9>"$HIDDIFY_RUN/core.lock"
flock -n 9 || { echo "another install is running"; exit 1; }

VERSION="${1:-latest}"
ASSET="$(detect_asset)"
CORE="$(hcfg main core_path /usr/bin/hiddify-core)"

if [ -z "$ASSET" ]; then
	hstatus "$STATUS" error "Unsupported architecture, set core_asset manually"
	exit 1
fi

if [ "$VERSION" = latest ]; then
	URL="https://github.com/$REPO/releases/latest/download/hiddify-core-$ASSET.tar.gz"
else
	URL="https://github.com/$REPO/releases/download/$VERSION/hiddify-core-$ASSET.tar.gz"
fi

TGZ=/tmp/hiddify-core.tar.gz
hstatus "$STATUS" running "Downloading hiddify-core-$ASSET ($VERSION)"
hlog "downloading $URL"
if ! hfetch "$URL" "$TGZ"; then
	rm -f "$TGZ"
	hstatus "$STATUS" error "Download failed: $URL"
	exit 1
fi

hstatus "$STATUS" running "Extracting"
MEMBER="$(tar -tzf "$TGZ" 2>/dev/null | grep '/hiddify-core$' | head -n1)"
if [ -z "$MEMBER" ] || ! tar -xzOf "$TGZ" "$MEMBER" > "$CORE.new"; then
	rm -f "$TGZ" "$CORE.new"
	hstatus "$STATUS" error "Archive does not contain hiddify-core"
	exit 1
fi
rm -f "$TGZ"
chmod 755 "$CORE.new"

if ! NEWVER="$("$CORE.new" version 2>/dev/null | head -n1)" || [ -z "$NEWVER" ]; then
	rm -f "$CORE.new"
	hstatus "$STATUS" error "Downloaded binary does not run on this CPU (asset $ASSET)"
	exit 1
fi

mv "$CORE.new" "$CORE"
hstatus "$STATUS" ok "Installed: $NEWVER"
hlog "installed $NEWVER"

hiddify_running && /etc/init.d/hiddify restart
exit 0
