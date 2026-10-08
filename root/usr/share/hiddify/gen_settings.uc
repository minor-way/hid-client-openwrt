#!/usr/bin/ucode
// Render /etc/config/hiddify into a complete hiddify-core settings JSON.
// hiddify-core does not merge the -d file over its defaults, so every field is emitted.

'use strict';

import { cursor } from 'uci';
import { writefile, rename, mkdir } from 'fs';

const out = ARGV[0] || '/var/etc/hiddify/settings.json';
const uci = cursor();

function get(sect, opt, def) {
	let v = uci.get('hiddify', sect, opt);
	return (v == null || v === '') ? def : v;
}

function bool(sect, opt, def) {
	return get(sect, opt, def ? '1' : '0') == '1';
}

function int(sect, opt, def) {
	let v = +get(sect, opt, def);
	return (v == null || v != v) ? def : v;
}

const settings = {
	'log-level': get('main', 'log_level', 'warn'),
	'region': get('main', 'region', 'other'),
	'block-ads': bool('main', 'block_ads', false),
	'enable-ntp': bool('main', 'ntp', true),
	'balancer-strategy': get('main', 'balancer', 'round-robin'),
	'use-xray-core-when-possible': false,
	'enable-clash-api': true,
	'rules': [],

	'remote-dns-address': get('dns', 'remote_dns', 'https://1.1.1.1/dns-query'),
	'remote-dns-domain-strategy': get('dns', 'remote_strategy', ''),
	'direct-dns-address': get('dns', 'direct_dns', '1.1.1.1'),
	'direct-dns-domain-strategy': get('dns', 'direct_strategy', ''),
	'independent-dns-cache': bool('dns', 'independent_cache', false),
	'enable-fake-dns': false,

	'enable-tun': false,
	'enable-tun-service': false,
	'set-system-proxy': false,
	'mixed-port': int('main', 'mixed_port', 12334),
	'tproxy-port': int('main', 'mixed_port', 12334) + 1,
	'redirect-port': int('main', 'mixed_port', 12334) + 2,
	'direct-port': int('main', 'mixed_port', 12334) + 3,
	'mtu': 9000,
	'strict-route': false,
	'tun-implementation': 'mixed',

	'connection-test-url': get('main', 'test_url', 'http://cp.cloudflare.com/'),
	'url-test-interval': int('main', 'url_test_interval', 600),

	'resolve-destination': false,
	'ipv6-mode': get('dns', 'ipv6_mode', ''),
	'bypass-lan': false,
	// Must stay false: it would also bind the unauthenticated clash API on 0.0.0.0.
	'allow-connection-from-lan': false,
	'block-quic': false,

	'tls-tricks': {
		'enable-fragment': bool('tls', 'fragment', false),
		'fragment-size': get('tls', 'fragment_size', '10-100'),
		'fragment-sleep': get('tls', 'fragment_sleep', '50-200'),
		'mixed-sni-case': bool('tls', 'mixed_sni_case', false),
		'enable-padding': bool('tls', 'padding', false),
		'padding-size': get('tls', 'padding_size', '1200-1500'),
	},

	'mux': {
		'enable': bool('mux', 'enabled', false),
		'padding': bool('mux', 'padding', true),
		'max-streams': int('mux', 'max_streams', 8),
		'protocol': get('mux', 'protocol', 'h2mux'),
	},

	'warp': {
		'enable': bool('warp', 'enabled', false),
		// Doubles as the WARP+ license (26 chars); otherwise a free identity is generated and cached in the workdir.
		'id': get('warp', 'license', 'warp'),
		'mode': get('warp', 'mode', 'proxy_over_warp'),
		'clean-ip': get('warp', 'clean_ip', 'auto'),
		'clean-port': int('warp', 'clean_port', 0),
		'noise': get('warp', 'noise', '1-3'),
		'noise-size': get('warp', 'noise_size', '10-30'),
		'noise-delay': get('warp', 'noise_delay', '10-30'),
		'noise-mode': get('warp', 'noise_mode', 'm4'),
	},
};

mkdir(replace(out, /\/[^\/]+$/, ''));
if (!writefile(out + '.tmp', sprintf('%.J\n', settings)) || !rename(out + '.tmp', out)) {
	warn(`gen_settings: cannot write ${out}\n`);
	exit(1);
}
