'use strict';
'require view';
'require rpc';
'require poll';
'require ui';
'require dom';

const LINES = 500;

const callLog = rpc.declare({ object: 'luci.hiddify', method: 'log', params: ['lines'], expect: { '': {} } });
const callLogClear = rpc.declare({ object: 'luci.hiddify', method: 'log_clear', expect: { '': {} } });

function fmtSize(bytes) {
	if (bytes == null)
		return '-';
	return bytes < 1024 ? bytes + ' B' : (bytes / 1024).toFixed(1) + ' KB';
}

return view.extend({
	load: function() {
		return callLog(LINES);
	},

	where: function(res) {
		return res.persist
			? _('Stored on flash: %s (%s, rotated by size, see Settings).').format(res.file, fmtSize(res.size))
			: _('Stored in RAM (system log), lost on reboot. Enable "Save log to flash" under Settings to keep it.');
	},

	update: function(res) {
		const pre = this.pre;
		const atBottom = pre.scrollTop + pre.clientHeight >= pre.scrollHeight - 20;
		dom.content(pre, res.log || _('No log entries yet.'));
		dom.content(this.info, this.where(res));
		this.text = res.log || '';
		if (atBottom)
			pre.scrollTop = pre.scrollHeight;
	},

	refresh: function() {
		return callLog(LINES).then(L.bind(this.update, this));
	},

	handleClear: function() {
		if (!confirm(_('Delete all Hiddify log entries?')))
			return;
		return callLogClear().then(L.bind(this.refresh, this));
	},

	handleDownload: function() {
		const blob = new Blob([ this.text ], { type: 'text/plain' });
		const a = E('a', {
			'href': URL.createObjectURL(blob),
			'download': 'hiddify-' + new Date().toISOString().replace(/[:.]/g, '-') + '.log'
		});
		document.body.appendChild(a);
		a.click();
		a.remove();
		URL.revokeObjectURL(a.href);
	},

	render: function(res) {
		this.pre = E('pre', {
			'style': 'white-space:pre-wrap;word-break:break-all;max-height:70vh;overflow-y:auto;font-size:12px'
		});
		this.info = E('span');
		this.update(res);

		poll.add(L.bind(this.refresh, this), 5);
		window.requestAnimationFrame(L.bind(function() { this.pre.scrollTop = this.pre.scrollHeight; }, this));

		return E('div', { 'class': 'cbi-map' }, [
			E('h2', {}, _('Hiddify log')),
			E('div', { 'class': 'cbi-map-descr' }, [ _('Last %d lines.').format(LINES), ' ', this.info ]),
			E('div', { 'class': 'cbi-page-actions', 'style': 'text-align:left' }, [
				E('button', { 'class': 'cbi-button cbi-button-reload', 'click': ui.createHandlerFn(this, 'refresh') }, _('Refresh')),
				' ',
				E('button', { 'class': 'cbi-button cbi-button-neutral', 'click': ui.createHandlerFn(this, 'handleDownload') }, _('Download')),
				' ',
				E('button', { 'class': 'cbi-button cbi-button-negative', 'click': ui.createHandlerFn(this, 'handleClear') }, _('Clear log'))
			]),
			this.pre
		]);
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
