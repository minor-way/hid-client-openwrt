#!/bin/sh
# Build luci-app-hiddify_<version>_all.ipk without the OpenWrt SDK.
# An ipk is a gzipped tar of debian-binary, data.tar.gz and control.tar.gz (same as ipkg-build).
set -eu

cd "$(dirname "$0")"
PKG=luci-app-hiddify
VERSION="$(sed -n 's/^Version: //p' CONTROL/control)"
OUT="dist/${PKG}_${VERSION}_all.ipk"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

export COPYFILE_DISABLE=1
TAR_OPTS="--format ustar --uid 0 --gid 0 --uname root --gname root"

mkdir -p "$WORK/data/www" "$WORK/control" dist
cp -R root/. "$WORK/data/"
cp -R htdocs/. "$WORK/data/www/"
find "$WORK/data" -name '.DS_Store' -delete
find "$WORK/data" -type d -exec chmod 755 {} +
find "$WORK/data" -type f -exec chmod 644 {} +
chmod 755 "$WORK/data/etc/init.d/hiddify" \
	"$WORK/data/usr/libexec/rpcd/luci.hiddify" \
	"$WORK/data/usr/share/hiddify/"*.sh \
	"$WORK/data/usr/share/hiddify/gen_settings.uc"
chmod 600 "$WORK/data/etc/config/hiddify"

SIZE="$(du -sk "$WORK/data" | cut -f1)"
cp CONTROL/* "$WORK/control/"
printf 'Installed-Size: %s\n' "$((SIZE * 1024))" >> "$WORK/control/control"
chmod 644 "$WORK/control/control" "$WORK/control/conffiles"
chmod 755 "$WORK/control/postinst" "$WORK/control/prerm"

# shellcheck disable=SC2086
(cd "$WORK/data" && tar $TAR_OPTS -czf ../data.tar.gz .)
# shellcheck disable=SC2086
(cd "$WORK/control" && tar $TAR_OPTS -czf ../control.tar.gz .)
echo "2.0" > "$WORK/debian-binary"
# shellcheck disable=SC2086
(cd "$WORK" && tar $TAR_OPTS -czf pkg.ipk ./debian-binary ./data.tar.gz ./control.tar.gz)
mv "$WORK/pkg.ipk" "$OUT"
echo "$OUT"
