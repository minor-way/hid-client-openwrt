'use strict';
'require view';
'require form';

const STRATEGIES = [
	[ '', _('As is') ],
	[ 'prefer_ipv4', _('Prefer IPv4') ],
	[ 'prefer_ipv6', _('Prefer IPv6') ],
	[ 'ipv4_only', _('IPv4 only') ],
	[ 'ipv6_only', _('IPv6 only') ]
];

function strategy(s, name, title) {
	const o = s.option(form.ListValue, name, title);
	STRATEGIES.forEach(function(v) { o.value(v[0], v[1]); });
	return o;
}

function range(s, name, title, placeholder) {
	const o = s.option(form.Value, name, title);
	o.placeholder = placeholder;
	o.datatype = 'string';
	o.validate = function(section, value) {
		return (!value || /^\d+(-\d+)?$/.test(value)) ? true : _('Use N or N-M');
	};
	return o;
}

return view.extend({
	render: function() {
		const m = new form.Map('hiddify', _('Hiddify settings'),
			_('Options passed to hiddify-core. Saving restarts the service.'));
		let s, o;

		s = m.section(form.NamedSection, 'main', 'hiddify', _('General'));

		o = s.option(form.Value, 'mixed_port', _('SOCKS/HTTP port'),
			_('Listens on 127.0.0.1 only. The next three ports are used internally. Refresh the Passwall2 node after changing.'));
		o.datatype = 'port';
		o.placeholder = '12334';

		o = s.option(form.ListValue, 'log_level', _('Log level'));
		[ 'trace', 'debug', 'info', 'warn', 'error', 'fatal', 'panic' ].forEach(function(l) { o.value(l); });
		o.default = 'warn';

		o = s.option(form.Flag, 'log_persist', _('Save log to flash'),
			_('Keeps the log across reboots instead of only in the RAM system log.'));
		o.default = '1';
		o.rmempty = false;

		o = s.option(form.Value, 'log_file', _('Log file'));
		o.placeholder = '/etc/hiddify/log/hiddify.log';
		o.validate = function(section, value) {
			return (!value || /^\/[^\s]+$/.test(value)) ? true : _('Absolute path expected');
		};
		o.depends('log_persist', '1');

		o = s.option(form.Value, 'log_max_kb', _('Max log size (KB)'),
			_('Checked every 10 minutes; the old log is kept as one .1 copy.'));
		o.datatype = 'range(64,65536)';
		o.placeholder = '1024';
		o.depends('log_persist', '1');

		o = s.option(form.ListValue, 'region', _('Region'),
			_('Lets hiddify-core send domestic sites direct. Keep "Other" when Passwall2 already does the Iran shunt; other values download rule sets from GitHub.'));
		o.value('other', _('Other (proxy everything)'));
		[ 'ir', 'cn', 'ru', 'af', 'id', 'tr', 'br' ].forEach(function(r) { o.value(r, r.toUpperCase()); });
		o.default = 'other';

		o = s.option(form.Flag, 'block_ads', _('Block ads'));

		o = s.option(form.Flag, 'ntp', _('Built-in NTP'));
		o.default = '1';

		o = s.option(form.ListValue, 'default_server', _('Default server'),
			_('Used until a server is picked on the Servers page.'));
		o.value('lowest', _('Auto (lowest delay)'));
		o.value('balance', _('Load balance'));
		o.default = 'lowest';

		o = s.option(form.ListValue, 'balancer', _('Load balance strategy'),
			_('Used by the "Load balance" entry on the Servers page.'));
		o.value('round-robin', _('Round robin'));
		o.value('consistent-hashing', _('Consistent hashing'));
		o.value('sticky-sessions', _('Sticky sessions'));
		o.value('lowest-delay', _('Lowest delay'));
		o.default = 'round-robin';

		o = s.option(form.Value, 'test_url', _('Connection test URL'));
		o.placeholder = 'http://cp.cloudflare.com/';
		o.datatype = 'string';

		o = s.option(form.Value, 'url_test_interval', _('URL test interval (s)'));
		o.datatype = 'uinteger';
		o.placeholder = '600';

		o = s.option(form.ListValue, 'core_asset', _('Core build'),
			_('Release asset to download. "Auto" picks it from the router architecture.'));
		o.value('auto', _('Auto'));
		[ 'linux-armv7-musl', 'linux-armv7', 'linux-arm64-musl', 'linux-arm64', 'linux-amd64-musl', 'linux-mipsle-softfloat', 'linux-mips-softfloat' ]
			.forEach(function(a) { o.value(a); });
		o.default = 'auto';

		o = s.option(form.Value, 'core_path', _('Core path'));
		o.placeholder = '/usr/bin/hiddify-core';

		s = m.section(form.NamedSection, 'dns', 'dns', _('DNS'));

		o = s.option(form.Value, 'remote_dns', _('Remote DNS'), _('Resolved through the proxy, e.g. https://1.1.1.1/dns-query, tcp://8.8.8.8, 1.1.1.1'));
		o.placeholder = 'https://1.1.1.1/dns-query';
		strategy(s, 'remote_strategy', _('Remote DNS strategy'));

		o = s.option(form.Value, 'direct_dns', _('Direct DNS'));
		o.placeholder = '1.1.1.1';
		strategy(s, 'direct_strategy', _('Direct DNS strategy'));

		strategy(s, 'ipv6_mode', _('IPv6 mode'));

		o = s.option(form.Flag, 'independent_cache', _('Independent DNS cache'));

		s = m.section(form.NamedSection, 'tls', 'tls', _('TLS tricks'),
			_('Helps against SNI-based filtering. Only affects TLS connections.'));

		o = s.option(form.Flag, 'fragment', _('TLS fragment'));
		range(s, 'fragment_size', _('Fragment size'), '10-100').depends('fragment', '1');
		range(s, 'fragment_sleep', _('Fragment sleep (ms)'), '50-200').depends('fragment', '1');

		o = s.option(form.Flag, 'mixed_sni_case', _('Mixed SNI case'));

		o = s.option(form.Flag, 'padding', _('TLS padding'));
		range(s, 'padding_size', _('Padding size'), '1200-1500').depends('padding', '1');

		s = m.section(form.NamedSection, 'mux', 'mux', _('Multiplex'));

		o = s.option(form.Flag, 'enabled', _('Enable mux'), _('Only works when the server supports it.'));
		o = s.option(form.ListValue, 'protocol', _('Protocol'));
		[ 'h2mux', 'smux', 'yamux' ].forEach(function(p) { o.value(p); });
		o.depends('enabled', '1');
		o = s.option(form.Value, 'max_streams', _('Max streams'));
		o.datatype = 'uinteger';
		o.placeholder = '8';
		o.depends('enabled', '1');
		o = s.option(form.Flag, 'padding', _('Padding'));
		o.default = '1';
		o.depends('enabled', '1');

		s = m.section(form.NamedSection, 'warp', 'warp', _('Cloudflare WARP'),
			_('Chains connections with Cloudflare WARP. A free identity is generated on first start.'));

		o = s.option(form.Flag, 'enabled', _('Enable WARP'));
		o = s.option(form.ListValue, 'mode', _('Mode'));
		o.value('proxy_over_warp', _('Proxy over WARP'));
		o.value('warp_over_proxy', _('WARP over proxy'));
		o.depends('enabled', '1');
		o = s.option(form.Value, 'license', _('WARP+ license key'), _('Optional, 26 characters.'));
		o.depends('enabled', '1');
		o = s.option(form.Value, 'clean_ip', _('Clean IP'));
		o.placeholder = 'auto';
		o.depends('enabled', '1');
		o = s.option(form.Value, 'clean_port', _('Clean port'), _('0 = auto'));
		o.datatype = 'port';
		o.placeholder = '0';
		o.depends('enabled', '1');
		range(s, 'noise', _('Noise count'), '1-3').depends('enabled', '1');
		range(s, 'noise_size', _('Noise size'), '10-30').depends('enabled', '1');
		range(s, 'noise_delay', _('Noise delay (ms)'), '10-30').depends('enabled', '1');
		o = s.option(form.ListValue, 'noise_mode', _('Noise mode'));
		[ 'm1', 'm2', 'm3', 'm4', 'm5', 'm6' ].forEach(function(n) { o.value(n); });
		o.depends('enabled', '1');

		return m.render();
	}
});
