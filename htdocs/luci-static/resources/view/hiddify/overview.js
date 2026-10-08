'use strict';
'require view';
'require form';
'require rpc';
'require poll';
'require ui';
'require dom';

const callStatus = rpc.declare({ object: 'luci.hiddify', method: 'status', expect: { '': {} } });
const callInstallCore = rpc.declare({ object: 'luci.hiddify', method: 'install_core', params: ['version'] });
const callCheckCore = rpc.declare({ object: 'luci.hiddify', method: 'check_core', expect: { '': {} } });
const callUpdateSub = rpc.declare({ object: 'luci.hiddify', method: 'update_sub' });
const callTest = rpc.declare({ object: 'luci.hiddify', method: 'test', params: ['url'], expect: { '': {} } });
const callPw2Node = rpc.declare({ object: 'luci.hiddify', method: 'pw2_node', expect: { '': {} } });
const callPw2Use = rpc.declare({ object: 'luci.hiddify', method: 'pw2_use', params: ['use'], expect: { '': {} } });
const callInitAction = rpc.declare({ object: 'rc', method: 'init', params: ['name', 'action'], expect: { result: false } });

function fmtTime(ts) {
	return ts ? new Date(ts * 1000).toLocaleString() : '-';
}

function badge(ok, yes, no) {
	return E('span', {
		'class': 'label',
		'style': 'color:#fff;padding:2px 8px;border-radius:3px;background:' + (ok ? '#2e7d32' : '#c62828')
	}, ok ? yes : no);
}

function jobText(job) {
	// finished jobs are already reflected in the row itself
	if (!job || job.state === 'ok')
		return '';
	const color = job.state === 'ok' ? '#2e7d32' : job.state === 'error' ? '#c62828' : '#ef6c00';
	return E('span', { 'style': 'color:' + color }, ' ' + job.message + ' (' + fmtTime(job.time) + ')');
}

function row(label, value) {
	return E('tr', { 'class': 'tr' }, [
		E('td', { 'class': 'td left', 'width': '33%' }, label),
		E('td', { 'class': 'td left' }, value)
	]);
}

function notifyError(res) {
	if (res && res.error)
		ui.addNotification(null, E('p', res.error), 'danger');
	return res;
}

return view.extend({
	load: function() {
		return callStatus();
	},

	renderStatus: function(st) {
		const pw2 = st.pw2 || {};
		const svc = st.running
			? E('span', {}, [ badge(true, _('Running')), ' PID ' + st.pid + (st.rss_kb ? ', ' + (st.rss_kb / 1024).toFixed(1) + ' MB' : '') ])
			: E('span', {}, [ badge(false, '', st.enabled ? _('Not running') : _('Disabled')) ]);

		const core = st.core_installed
			? E('span', {}, [ (st.core_version || _('installed')).replace(' hiddify-sing-box version ', ' / sing-box '), ' ', E('small', {}, '(' + st.asset + ')'), jobText(st.core_job) ])
			: E('span', {}, [ badge(false, '', _('Not installed')), ' ', E('small', {}, _('asset') + ': ' + (st.asset || '?')), jobText(st.core_job) ]);

		let sub = st.sub_cached
			? E('span', {}, [ _('cached') + ' ' + fmtTime(st.sub_cached.mtime) + (st.sub_job && st.sub_job.nodes != null ? ', ' + st.sub_job.nodes + ' ' + _('servers') : '') ])
			: E('span', {}, _('not downloaded yet'));
		sub = E('span', {}, [ sub, jobText(st.sub_job) ]);

		let pw2text;
		if (!pw2.installed)
			pw2text = _('Passwall2 not installed');
		else
			pw2text = E('span', {}, [
				badge(pw2.using, _('Using Hiddify'), _('Not using Hiddify')),
				' ' + (pw2.shunt ? _('Shunt "%s" default → %s').format(pw2.global_remarks || pw2.global_node, pw2.current_remarks || pw2.current || '-')
					: _('Main node → %s').format(pw2.current_remarks || pw2.current || '-')),
				pw2.enabled ? '' : ' ' + _('(Passwall2 disabled)')
			]);

		return E('table', { 'class': 'table' }, [
			row(_('Service'), svc),
			row(_('Core'), core),
			row(_('Subscription'), sub),
			row(_('SOCKS/HTTP proxy'), '127.0.0.1:' + st.mixed_port),
			row(_('Passwall2'), pw2text)
		]);
	},

	renderActions: function(st) {
		const pw2 = st.pw2 || {};
		const self = this;
		const btn = function(title, cls, fn) {
			return E('button', { 'class': 'cbi-button ' + cls, 'click': ui.createHandlerFn(self, fn) }, title);
		};

		const testResult = E('span', { 'style': 'margin-left:8px' });

		const actions = [
			btn(st.core_installed ? _('Update core') : _('Install core'), 'cbi-button-action', function() {
				return callCheckCore().then(function(r) {
					const latest = r.latest || 'latest';
					if (!confirm(_('Download hiddify-core %s (~25 MB) for %s?').format(latest, st.asset)))
						return;
					return callInstallCore(r.latest || 'latest').then(notifyError);
				});
			}),
			btn(_('Update subscription'), 'cbi-button-action', function() {
				return callUpdateSub().then(notifyError);
			}),
			btn(_('Restart'), 'cbi-button-reload', function() {
				return callInitAction('hiddify', 'restart');
			}),
			btn(_('Test connection'), 'cbi-button-neutral', function() {
				dom.content(testResult, E('em', {}, _('testing…')));
				return callTest().then(function(r) {
					dom.content(testResult, r.ok
						? E('span', { 'style': 'color:#2e7d32' }, _('OK, HTTP %d in %d ms').format(r.code, r.ms))
						: E('span', { 'style': 'color:#c62828' }, _('Failed (HTTP %s)').format(r.code || '-')));
				});
			}),
			testResult
		];

		const pwActions = [];
		if (pw2.installed) {
			pwActions.push(btn(pw2.node_exists ? _('Refresh Passwall2 node') : _('Create Passwall2 node'), 'cbi-button-apply', function() {
				return callPw2Node().then(notifyError).then(function(r) {
					if (r && !r.error)
						ui.addNotification(null, E('p', _('Passwall2 node "Hiddify" (%s) is ready.').format(r.node)), 'info');
				});
			}));
			if (!pw2.using)
				pwActions.push(btn(_('Use Hiddify in Passwall2'), 'cbi-button-positive', function() {
					const where = pw2.shunt ? _('as the default node of shunt "%s"').format(pw2.global_remarks || pw2.global_node) : _('as the Passwall2 main node');
					if (!confirm(_('Route Passwall2 through Hiddify %s? Passwall2 will restart.').format(where)))
						return;
					return callPw2Use(true).then(notifyError);
				}));
			else
				pwActions.push(btn(_('Revert Passwall2 node'), 'cbi-button-negative', function() {
					if (!confirm(_('Restore the previous Passwall2 node? Passwall2 will restart.')))
						return;
					return callPw2Use(false).then(notifyError);
				}));
		}

		return E('div', {}, [
			E('div', { 'class': 'cbi-page-actions', 'style': 'text-align:left' }, actions),
			pwActions.length ? E('div', { 'class': 'cbi-page-actions', 'style': 'text-align:left' }, pwActions) : ''
		]);
	},

	render: function(st) {
		const self = this;
		const statusNode = E('div', { 'id': 'hiddify-status' }, this.renderStatus(st));
		const actionsNode = E('div', { 'id': 'hiddify-actions' }, this.renderActions(st));

		poll.add(function() {
			return callStatus().then(function(s) {
				dom.content(statusNode, self.renderStatus(s));
				// keep the test result while the button row is unchanged
				const key = [ s.core_installed, s.pw2 && s.pw2.using, s.pw2 && s.pw2.node_exists ].join();
				if (actionsNode.dataset.key !== key) {
					actionsNode.dataset.key = key;
					dom.content(actionsNode, self.renderActions(s));
				}
			});
		}, 5);
		actionsNode.dataset.key = [ st.core_installed, st.pw2 && st.pw2.using, st.pw2 && st.pw2.node_exists ].join();

		const m = new form.Map('hiddify', _('Hiddify'),
			_('Runs hiddify-core with your Hiddify subscription as a local SOCKS/HTTP proxy and plugs it into Passwall2 as a node.'));
		const s = m.section(form.NamedSection, 'main', 'hiddify', _('Basic settings'));
		s.addremove = false;

		let o = s.option(form.Flag, 'enabled', _('Enable'));
		o.rmempty = false;

		o = s.option(form.Value, 'sub_url', _('Subscription URL'),
			_('Hiddify panel subscription link (https://…). Single vless://, vmess://, … links are also accepted.'));
		o.placeholder = 'https://panel.example.com/…/sub/';
		o.validate = function(section, value) {
			if (!value || /^(https?|vless|vmess|trojan|ss|hy2|hysteria2|tuic|wg|warp):\/\//.test(value))
				return true;
			return _('Expecting an http(s) URL or a proxy link');
		};

		o = s.option(form.ListValue, 'sub_update_hours', _('Auto update subscription'));
		o.value('0', _('Never'));
		[ 1, 3, 6, 12, 24 ].forEach(function(h) { o.value(String(h), _('Every %d hours').format(h)); });
		o.default = '12';

		return m.render().then(function(formNode) {
			return E('div', {}, [
				formNode,
				E('h3', {}, _('Status')),
				statusNode,
				actionsNode
			]);
		});
	}
});
