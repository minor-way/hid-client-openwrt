'use strict';
'require view';
'require rpc';
'require ui';
'require dom';

const callProxies = rpc.declare({ object: 'luci.hiddify', method: 'proxies', expect: { '': {} } });
const callSelect = rpc.declare({ object: 'luci.hiddify', method: 'select', params: ['group', 'name'], expect: { '': {} } });
const callDelay = rpc.declare({ object: 'luci.hiddify', method: 'delay', params: ['name'], expect: { '': {} } });
const callDelayBatch = rpc.declare({ object: 'luci.hiddify', method: 'delay_batch', params: ['names'], expect: { '': {} } });

const SELECTOR = 'select';
const BATCH_SIZE = 10;
const LANES = 2;

function hidden(name) {
	return name.indexOf('§hide§') !== -1;
}

function delayCell(ms) {
	if (ms == null)
		return E('span', { 'style': 'color:#888' }, '-');
	// sing-box records failed tests as 0 or 65535
	if (ms <= 0 || ms >= 65535)
		return E('span', { 'style': 'color:#c62828' }, _('timeout'));
	const color = ms < 300 ? '#2e7d32' : ms < 800 ? '#ef6c00' : '#c62828';
	return E('span', { 'style': 'color:' + color }, ms + ' ms');
}

function lastDelay(p) {
	const h = p && p.history;
	return (h && h.length) ? h[h.length - 1].delay : null;
}

return view.extend({
	load: function() {
		return callProxies();
	},

	renderTable: function(res) {
		const self = this;

		if (!res || res.error || !res.result || !res.result.proxies)
			return E('div', { 'class': 'alert-message warning' },
				_('hiddify-core is not running or its API is unreachable (%s).').format((res && res.error) || _('no data')));

		const proxies = res.result.proxies;
		const sel = proxies[SELECTOR];
		if (!sel)
			return E('div', { 'class': 'alert-message warning' }, _('No "select" group in the running config.'));

		const rows = sel.all.filter(function(n) { return !hidden(n); }).map(function(name) {
			const p = proxies[name] || {};
			const active = sel.now === name;
			const delayNode = E('td', { 'class': 'td', 'data-delay': name }, delayCell(lastDelay(p)));
			let label = name;
			if (name === 'lowest')
				label = _('Auto (lowest delay)') + (p.now ? ' → ' + p.now : '');
			else if (name === 'balance')
				label = _('Load balance');

			return E('tr', { 'class': 'tr' + (active ? ' cbi-rowstyle-2' : '') }, [
				E('td', { 'class': 'td' }, active ? E('strong', {}, '● ' + label) : label),
				E('td', { 'class': 'td' }, p.type || ''),
				delayNode,
				E('td', { 'class': 'td' }, [
					active ? E('em', {}, _('selected')) : E('button', {
						'class': 'cbi-button cbi-button-apply',
						'click': ui.createHandlerFn(self, function() {
							return callSelect(SELECTOR, name).then(function(r) {
								if (r.error)
									ui.addNotification(null, E('p', r.error), 'danger');
								return self.refresh();
							});
						})
					}, _('Use')),
					' ',
					E('button', {
						'class': 'cbi-button cbi-button-neutral',
						'click': ui.createHandlerFn(self, function() { return self.testOne(name); })
					}, _('Test'))
				])
			]);
		});

		return E('table', { 'class': 'table' }, [
			E('tr', { 'class': 'tr table-titles' }, [
				E('th', { 'class': 'th' }, _('Server')),
				E('th', { 'class': 'th' }, _('Type')),
				E('th', { 'class': 'th' }, _('Delay')),
				E('th', { 'class': 'th' }, _('Action'))
			])
		].concat(rows));
	},

	delayNode: function(name) {
		return this.tableNode.querySelector('td[data-delay="' + CSS.escape(name) + '"]');
	},

	setDelay: function(name, content) {
		const cell = this.delayNode(name);
		if (cell)
			dom.content(cell, content);
	},

	testOne: function(name) {
		const self = this;
		this.setDelay(name, E('em', {}, '…'));
		return callDelay(name).then(function(r) {
			self.setDelay(name, delayCell(r.result ? r.result.delay : 0));
		}).catch(function() {
			self.setDelay(name, E('span', { 'style': 'color:#c62828' }, _('error')));
		});
	},

	testAll: function() {
		const self = this;
		const names = Array.prototype.map.call(this.tableNode.querySelectorAll('td[data-delay]'),
			function(td) { return td.getAttribute('data-delay'); })
			.filter(function(n) { return n !== 'lowest' && n !== 'balance'; });

		names.forEach(function(n) { self.setDelay(n, E('em', {}, '…')); });

		const batches = [];
		for (let i = 0; i < names.length; i += BATCH_SIZE)
			batches.push(names.slice(i, i + BATCH_SIZE));

		// LANES batches in flight; a failed batch is marked and the rest still run
		let next = 0;
		const lane = function() {
			if (next >= batches.length)
				return Promise.resolve();
			const batch = batches[next++];
			return callDelayBatch(batch).then(function(r) {
				const res = (r && r.result) || {};
				batch.forEach(function(n) { self.setDelay(n, delayCell(res[n] != null ? res[n] : 0)); });
			}).catch(function() {
				batch.forEach(function(n) { self.setDelay(n, E('span', { 'style': 'color:#c62828' }, _('error'))); });
			}).then(lane);
		};
		const lanes = [];
		for (let i = 0; i < LANES; i++)
			lanes.push(lane());
		return Promise.all(lanes);
	},

	sortByDelay: function() {
		const table = this.tableNode.querySelector('table');
		if (!table)
			return;
		const rows = Array.prototype.slice.call(table.querySelectorAll('tr.tr:not(.table-titles)'));
		const value = function(tr) {
			const td = tr.querySelector('td[data-delay]');
			const n = td.getAttribute('data-delay');
			if (n === 'lowest' || n === 'balance')
				return -1;
			const m = /(\d+) ms/.exec(td.textContent);
			return m ? +m[1] : 1e9;
		};
		rows.sort(function(a, b) { return value(a) - value(b); }).forEach(function(tr) { table.appendChild(tr); });
	},

	refresh: function() {
		const self = this;
		return callProxies().then(function(res) {
			dom.content(self.tableNode, self.renderTable(res));
		});
	},

	render: function(res) {
		this.tableNode = E('div', {}, this.renderTable(res));
		return E('div', { 'class': 'cbi-map' }, [
			E('h2', {}, _('Hiddify servers')),
			E('div', { 'class': 'cbi-map-descr' },
				_('Servers from the subscription as loaded by hiddify-core. The selection applies immediately and is kept across restarts.')),
			E('div', { 'class': 'cbi-page-actions', 'style': 'text-align:left' }, [
				E('button', { 'class': 'cbi-button cbi-button-action', 'click': ui.createHandlerFn(this, 'testAll') }, _('Test all')),
				' ',
				E('button', { 'class': 'cbi-button cbi-button-neutral', 'click': ui.createHandlerFn(this, 'sortByDelay') }, _('Sort by delay')),
				' ',
				E('button', { 'class': 'cbi-button cbi-button-reload', 'click': ui.createHandlerFn(this, 'refresh') }, _('Refresh'))
			]),
			this.tableNode
		]);
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
