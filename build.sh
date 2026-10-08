#!/bin/sh
# Build packages without the OpenWrt SDK.
#   ./build.sh          panel ipk + panel tarball + one hiddify-core ipk per CPU family
#   ./build.sh panel    only luci-app-hiddify (ipk + tarball for apk-based OpenWrt 25.x)
#   ./build.sh core     only the hiddify-core ipks
# An ipk is a gzipped tar of debian-binary, data.tar.gz and control.tar.gz (same as ipkg-build).
set -eu

cd "$(dirname "$0")"
PKG=luci-app-hiddify
VERSION="$(sed -n 's/^Version: //p' CONTROL/control)"
CORE_VERSION=4.1.0
CORE_RELEASE=1
# hiddify-core release asset suffixes; keep in sync with detect_asset() in core_install.sh
CORE_ASSETS="linux-armv7-musl linux-armv6 linux-armv5 linux-arm64-musl linux-amd64-musl linux-386-musl
linux-mipsle-softfloat linux-mips-softfloat linux-mips64le-softfloat linux-mips64-softfloat linux-riscv64"

export COPYFILE_DISABLE=1
TAR_OPTS="--format ustar --uid 0 --gid 0 --uname root --gname root"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
mkdir -p dist .cache

# make_ipk <staging dir with data/ and control/> <output file>
make_ipk() {
	local dir="$1" out="$2" size
	size="$(du -sk "$dir/data" | cut -f1)"
	printf 'Installed-Size: %s\n' "$((size * 1024))" >> "$dir/control/control"
	find "$dir/control" -type f -exec chmod 644 {} +
	for s in postinst prerm; do
		[ -f "$dir/control/$s" ] && chmod 755 "$dir/control/$s"
	done
	# shellcheck disable=SC2086
	(cd "$dir/data" && tar $TAR_OPTS -czf ../data.tar.gz .)
	# shellcheck disable=SC2086
	(cd "$dir/control" && tar $TAR_OPTS -czf ../control.tar.gz .)
	echo "2.0" > "$dir/debian-binary"
	# shellcheck disable=SC2086
	(cd "$dir" && tar $TAR_OPTS -czf pkg.ipk ./debian-binary ./data.tar.gz ./control.tar.gz)
	mv "$dir/pkg.ipk" "$out"
	echo "$out"
}

stage_panel_files() {
	local dest="$1"
	mkdir -p "$dest/www"
	cp -R root/. "$dest/"
	cp -R htdocs/. "$dest/www/"
	find "$dest" -name '.DS_Store' -delete
	find "$dest" -type d -exec chmod 755 {} +
	find "$dest" -type f -exec chmod 644 {} +
	chmod 755 "$dest/etc/init.d/hiddify" \
		"$dest/usr/libexec/rpcd/luci.hiddify" \
		"$dest/usr/share/hiddify/"*.sh \
		"$dest/usr/share/hiddify/gen_settings.uc"
	chmod 600 "$dest/etc/config/hiddify"
}

build_panel() {
	local d="$WORK/panel" t="$WORK/tarball/$PKG"
	mkdir -p "$d/data" "$d/control"
	stage_panel_files "$d/data"
	cp CONTROL/* "$d/control/"
	make_ipk "$d" "dist/${PKG}_${VERSION}_all.ipk"

	# Same files for systems without opkg (OpenWrt 25.x uses apk): install.sh copies them into place.
	mkdir -p "$t/files"
	stage_panel_files "$t/files"
	cp CONTROL/postinst CONTROL/prerm install.sh "$t/"
	chmod 755 "$t/postinst" "$t/prerm" "$t/install.sh"
	# shellcheck disable=SC2086
	(cd "$WORK/tarball" && tar $TAR_OPTS -czf "$OLDPWD/dist/${PKG}_${VERSION}.tar.gz" "$PKG")
	echo "dist/${PKG}_${VERSION}.tar.gz"
}

build_core() {
	local asset tgz member d family
	for asset in $CORE_ASSETS; do
		tgz=".cache/hiddify-core-$asset.tar.gz"
		# re-download truncated or missing archives
		if ! tar -tzf "$tgz" >/dev/null 2>&1; then
			rm -f "$tgz"
			curl -fsSL --retry 5 --retry-all-errors -o "$tgz" \
				"https://github.com/hiddify/hiddify-core/releases/download/v$CORE_VERSION/hiddify-core-$asset.tar.gz"
		fi
		member="$(tar -tzf "$tgz" | grep '/hiddify-core$' | head -n1)"
		family="${asset#linux-}"
		d="$WORK/core-$family"
		mkdir -p "$d/data/usr/bin" "$d/control"
		tar -xzOf "$tgz" "$member" > "$d/data/usr/bin/hiddify-core"
		chmod 755 "$d/data/usr/bin/hiddify-core"
		cat > "$d/control/control" <<-EOF
			Package: hiddify-core
			Version: $CORE_VERSION-$CORE_RELEASE
			Depends: libc
			Source: https://github.com/hiddify/hiddify-core
			License: GPL-3.0
			Section: net
			Architecture: all
			Maintainer: minor-way
			Description: hiddify-core v$CORE_VERSION ($family build) for luci-app-hiddify. Pick the file matching your CPU.
		EOF
		sed "s/@FAMILY@/$family/" CONTROL/core-postinst > "$d/control/postinst"
		cp CONTROL/core-prerm "$d/control/prerm"
		make_ipk "$d" "dist/hiddify-core_${CORE_VERSION}-${CORE_RELEASE}_${family}.ipk"
	done
}

case "${1:-all}" in
	panel) build_panel ;;
	core) build_core ;;
	all) build_panel; build_core ;;
	*) echo "usage: $0 [panel|core|all]" >&2; exit 1 ;;
esac
