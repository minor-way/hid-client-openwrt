# luci-app-hiddify

A LuCI panel for running [hiddify-core](https://github.com/hiddify/hiddify-core) on OpenWrt with a Hiddify subscription, and plugging it into **Passwall2** as a node.

- **Subscription**: paste the Hiddify panel link (or a single `vless://`, `vmess://`, `hy2://` … link). It is cached on the router, updated on a schedule, and the last good copy is kept when a download fails.
- **Servers page**: every server from the subscription with delay tests (one or all), sort by delay, and one-click switching. *Auto (lowest delay)* is the default; your pick survives restarts.
- **Settings**: DNS, TLS tricks (fragment, padding, mixed SNI case), mux, Cloudflare WARP, region, ad blocking, log level.
- **Passwall2 integration**: one button creates a `Hiddify` SOCKS node and points Passwall2 (or the default of its shunt node) at it; another restores the previous node.
- **Log**: live view, kept on flash with size rotation, clear and download buttons.
- **Core management**: install or update hiddify-core from the panel, or install it offline from this repo's releases.

hiddify-core runs as an unprivileged `hiddify` user, listens on `127.0.0.1` only, and its own traffic is marked so Passwall2 does not loop it back into itself.

## Requirements

| | |
|---|---|
| OpenWrt | 23.05 / 24.10 (opkg, `.ipk`) or 25.x (apk, use the tarball) |
| Firewall | fw4 / nftables (default since 22.03) |
| Storage | ~90 MB free for hiddify-core (the binary is 64–79 MB; packages download as 22–30 MB) |
| RAM | 256 MB or more recommended (hiddify-core uses 55–90 MB) |
| Packages | `luci-base rpcd curl ca-bundle ucode ucode-mod-uci ucode-mod-fs nftables` (present on standard images) |
| Optional | `luci-app-passwall2` for transparent proxying of the whole LAN |

Small 8/16 MB flash routers cannot hold hiddify-core unless the overlay is extended (extroot).

## Downloads

All files are on the [Releases page](../../releases/latest).

| File | What it is |
|---|---|
| `luci-app-hiddify_<ver>_all.ipk` | The panel. One file for every device. |
| `luci-app-hiddify_<ver>.tar.gz` | The same panel for OpenWrt 25.x (apk), installed with `install.sh`. |
| `hiddify-core_<ver>_<cpu>.ipk` | hiddify-core binary for offline install. Pick your CPU below. |

### Which hiddify-core file?

Find your architecture on the router:

```sh
grep DISTRIB_ARCH /etc/openwrt_release
```

| `DISTRIB_ARCH` starts with | File | Typical devices |
|---|---|---|
| `aarch64_` | `hiddify-core_*_arm64-musl.ipk` | MT7981/MT7986 (Filogic), IPQ807x, Raspberry Pi 3/4/5, RK3328/3568 |
| `arm_cortex-a7`, `a8`, `a9_vfpv3`, `a15`, `a17`, `a5_vfpv4` | `hiddify-core_*_armv7-musl.ipk` | IPQ40xx, MT7623, Raspberry Pi 2, many NAS boards |
| `arm_cortex-a9` (no `vfp` suffix), `arm_cortex-a5` | `hiddify-core_*_armv5.ipk` | Broadcom BCM53xx (Northstar) |
| `arm_arm1176jzf-s_vfp` | `hiddify-core_*_armv6.ipk` | Raspberry Pi 1 / Zero |
| `arm_xscale`, `arm_arm926ej-s`, other `arm_` | `hiddify-core_*_armv5.ipk` | Old Kirkwood / Marvell |
| `x86_64` | `hiddify-core_*_amd64-musl.ipk` | PCs, VMs, mini PCs |
| `i386_` | `hiddify-core_*_386-musl.ipk` | 32-bit x86 |
| `mipsel_` | `hiddify-core_*_mipsle-softfloat.ipk` | MT7621, MT7628/MT7688 |
| `mips_` | `hiddify-core_*_mips-softfloat.ipk` | Atheros/Qualcomm ath79 (QCA95xx …) |
| `mips64el_` | `hiddify-core_*_mips64le-softfloat.ipk` | Loongson |
| `mips64_` | `hiddify-core_*_mips64-softfloat.ipk` | Cavium Octeon |
| `riscv64_` | `hiddify-core_*_riscv64.ipk` | VisionFive, other RISC-V |

The core package checks itself after install: if it does not run on your CPU it says so, and you can install another one. The panel's **Install core** button picks the right build automatically.

## Install (OpenWrt 23.05 / 24.10)

1. Copy the files to the router (from your PC):

   ```sh
   scp -O luci-app-hiddify_*_all.ipk hiddify-core_*_<cpu>.ipk root@192.168.1.1:/tmp/
   ```

2. Install them on the router:

   ```sh
   opkg install /tmp/luci-app-hiddify_*_all.ipk
   opkg install /tmp/hiddify-core_*.ipk      # optional, see step 3
   ```

   If opkg reports missing dependencies, run `opkg update` first (needs internet).

3. Open **LuCI → Services → Hiddify**.
   - If you skipped the core package, click **Install core**. It downloads the right build from GitHub, which needs a working route to github.com.
   - Paste your subscription link, tick **Enable**, and click **Save & Apply**.
   - Wait for the status to show *Running*, then click **Test connection**. A `204` means it works.

4. Route the LAN through it (needs Passwall2):
   - Click **Use Hiddify in Passwall2**. This creates the `Hiddify` node and makes it the default of your shunt node, or the main node if there is no shunt. Passwall2 restarts.
   - To undo it, click **Revert Passwall2 node**.

Without Passwall2, hiddify-core is still usable as a SOCKS5/HTTP proxy on `127.0.0.1:12334` for software on the router.

### Install directly from GitHub

If the router can already reach GitHub:

```sh
cd /tmp
wget https://github.com/minor-way/hid-client-openwrt/releases/latest/download/luci-app-hiddify_1.3.0-r1_all.ipk
opkg install luci-app-hiddify_1.3.0-r1_all.ipk
```

## Install (OpenWrt 25.x, apk)

`.ipk` files do not install with apk, so use the tarball:

```sh
apk add curl ca-bundle ucode-mod-uci ucode-mod-fs nftables   # if missing
cd /tmp
tar -xzf luci-app-hiddify_*.tar.gz
sh luci-app-hiddify/install.sh
```

For the core, use the panel's **Install core** button, or copy it by hand from the [hiddify-core releases](https://github.com/hiddify/hiddify-core/releases):

```sh
tar -xzOf hiddify-core-linux-<cpu>.tar.gz '*/hiddify-core' > /usr/bin/hiddify-core
chmod 755 /usr/bin/hiddify-core
```

To uninstall, run `sh luci-app-hiddify/install.sh uninstall`.

## Upgrade

Install the newer `.ipk` with `opkg install`. On 25.x, run the newer tarball's `install.sh`. Your settings in `/etc/config/hiddify` are kept.

## Uninstall

```sh
opkg remove luci-app-hiddify hiddify-core
```

Before removing, click **Revert Passwall2 node**, or pick another node in Passwall2; otherwise Passwall2 keeps pointing at a proxy that no longer exists.

## Files on the router

| Path | Purpose |
|---|---|
| `/etc/config/hiddify` | Settings (UCI) |
| `/etc/hiddify/sub.txt` | Cached subscription |
| `/etc/hiddify/selected` | Server picked on the Servers page |
| `/etc/hiddify/log/hiddify.log` | Persistent log (`.1` = previous rotation) |
| `/usr/bin/hiddify-core` | The core |
| `/var/etc/hiddify/settings.json` | Generated hiddify-core settings |

Command line:

```sh
/etc/init.d/hiddify restart              # restart the service
/usr/share/hiddify/sub_update.sh         # refresh the subscription now
/usr/share/hiddify/core_install.sh       # install/update the core (latest)
curl -x socks5h://127.0.0.1:12334 https://www.gstatic.com/generate_204 -w '%{http_code}\n'
```

## How it behaves

- **Failover.** hiddify-core re-tests all servers about every 5 minutes, and immediately when a connection through the current server fails. *Auto (lowest delay)* moves to the fastest working server without a restart.
- **Subscription updates.** Every N hours (default 12) the subscription is downloaded again. hiddify-core restarts only if the content changed, which takes about 5 seconds. Downloads go through Passwall2 when it is up, and fall back to Hiddify's own proxy.
- **Settings changes** regenerate the configuration and restart the core.

## Build from source

No OpenWrt SDK needed; a POSIX shell, `tar`, `gzip` and `curl` are enough (macOS or Linux).

```sh
./build.sh          # everything into dist/
./build.sh panel    # only the panel ipk + tarball
./build.sh core     # only the hiddify-core ipks (downloads v4.1.0 assets into .cache/)
```

## License

MIT for this panel. hiddify-core is GPL-3.0, © the Hiddify team.
