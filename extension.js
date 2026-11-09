import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup?version=3.0';
import St from 'gi://St';

import {Extension, gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {formatMoney, parseBalancePayload, updateUsageEstimate} from './balance.js';
import {lookupApiKey} from './secret.js';

const BALANCE_ENDPOINT = 'https://api.deepseek.com/user/balance';

export default class DeepSeekUsageExtension extends Extension {
    enable() {
        this._enabled = true;
        this._refreshing = false;
        this._timeoutId = null;
        this._settingsSignalIds = [];
        this._settings = this.getSettings();
        this._session = new Soup.Session({
            user_agent: `${this.metadata.name}/${this.metadata.version}`,
            timeout: 30,
        });
        this._cancellable = new Gio.Cancellable();

        this._buildIndicator();
        this._connectSettings();
        this._rescheduleRefresh();
        this._refreshBalance();
    }

    disable() {
        this._enabled = false;

        if (this._timeoutId) {
            GLib.Source.remove(this._timeoutId);
            this._timeoutId = null;
        }

        if (this._cancellable)
            this._cancellable.cancel();

        if (this._session)
            this._session.abort();

        for (const signalId of this._settingsSignalIds)
            this._settings.disconnect(signalId);

        this._indicator?.destroy();
        this._indicator = null;
        this._settings = null;
        this._session = null;
        this._cancellable = null;
    }

    _buildIndicator() {
        this._indicator = new PanelMenu.Button(0.0, this.metadata.name, false);

        const panelBox = new St.BoxLayout({
            style_class: 'panel-status-menu-box deepseek-panel-box',
        });

        this._icon = new St.Icon({
            icon_name: 'network-server-symbolic',
            style_class: 'system-status-icon',
        });
        this._label = new St.Label({
            text: _('DeepSeek …'),
            y_align: Clutter.ActorAlign.CENTER,
        });
        panelBox.add_child(this._icon);
        panelBox.add_child(this._label);
        this._indicator.add_child(panelBox);

        const titleItem = new PopupMenu.PopupMenuItem(_('DeepSeek API'), {reactive: false});
        titleItem.add_style_class_name('deepseek-menu-title');
        this._indicator.menu.addMenuItem(titleItem);

        this._balanceItem = new PopupMenu.PopupMenuItem(_('Balance: —'), {reactive: false});
        this._usageItem = new PopupMenu.PopupMenuItem(_('Today (estimated): —'), {reactive: false});
        this._breakdownItem = new PopupMenu.PopupMenuItem(_('Topped up: — · Granted: —'), {reactive: false});
        this._updatedItem = new PopupMenu.PopupMenuItem(_('Updated: —'), {reactive: false});
        this._errorItem = new PopupMenu.PopupMenuItem('', {reactive: false});
        this._errorItem.add_style_class_name('deepseek-error-item');
        this._errorItem.hide();

        this._indicator.menu.addMenuItem(this._balanceItem);
        this._indicator.menu.addMenuItem(this._usageItem);
        this._indicator.menu.addMenuItem(this._breakdownItem);
        this._indicator.menu.addMenuItem(this._updatedItem);
        this._indicator.menu.addMenuItem(this._errorItem);
        this._indicator.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        this._refreshItem = new PopupMenu.PopupImageMenuItem(
            _('Refresh now'),
            'view-refresh-symbolic'
        );
        this._refreshItem.connect('activate', () => this._refreshBalance());
        this._indicator.menu.addMenuItem(this._refreshItem);

        const settingsItem = new PopupMenu.PopupImageMenuItem(
            _('Settings'),
            'preferences-system-symbolic'
        );
        settingsItem.connect('activate', () => this.openPreferences());
        this._indicator.menu.addMenuItem(settingsItem);

        Main.panel.addToStatusArea(this.uuid, this._indicator);
    }

    _connectSettings() {
        this._settingsSignalIds.push(
            this._settings.connect('changed::refresh-interval', () => {
                this._rescheduleRefresh();
            }),
            this._settings.connect('changed::currency', () => this._refreshBalance()),
            this._settings.connect('changed::credential-version', () => this._refreshBalance()),
            this._settings.connect('changed::show-estimated-usage', () => this._refreshBalance()),
            this._settings.connect('changed::low-balance-threshold', () => this._refreshBalance()),
            this._settings.connect('changed::show-icon', () => this._updateIconVisibility())
        );

        this._updateIconVisibility();
    }

    _updateIconVisibility() {
        this._icon.visible = this._settings.get_boolean('show-icon');
    }

    _rescheduleRefresh() {
        if (this._timeoutId)
            GLib.Source.remove(this._timeoutId);

        const intervalMinutes = Math.max(1, this._settings.get_uint('refresh-interval'));
        this._timeoutId = GLib.timeout_add_seconds(
            GLib.PRIORITY_DEFAULT,
            intervalMinutes * 60,
            () => {
                this._refreshBalance();
                return GLib.SOURCE_CONTINUE;
            }
        );
    }

    _refreshBalance() {
        if (!this._enabled || this._refreshing)
            return;

        let apiKey;
        try {
            apiKey = lookupApiKey();
        } catch (error) {
            this._showError(_('Could not read the API key from GNOME Keyring.'));
            console.error(`${this.metadata.name}: keyring lookup failed: ${error.message}`);
            return;
        }

        if (!apiKey) {
            this._label.text = _('DeepSeek: setup required');
            this._showError(_('Add your API key in Settings.'));
            return;
        }

        this._refreshing = true;
        this._refreshItem.setSensitive(false);
        this._errorItem.hide();

        const message = Soup.Message.new('GET', BALANCE_ENDPOINT);
        message.request_headers.append('Authorization', `Bearer ${apiKey}`);
        message.request_headers.append('Accept', 'application/json');

        this._session.send_and_read_async(
            message,
            GLib.PRIORITY_DEFAULT,
            this._cancellable,
            (session, result) => {
                if (!this._enabled)
                    return;

                try {
                    const bytes = session.send_and_read_finish(result);
                    const status = message.status_code;

                    if (status < 200 || status >= 300)
                        throw new Error(this._messageForStatus(status));

                    const text = new TextDecoder().decode(bytes.get_data());
                    const payload = JSON.parse(text);
                    const balance = parseBalancePayload(
                        payload,
                        this._settings.get_string('currency')
                    );
                    this._showBalance(balance);
                } catch (error) {
                    if (!this._cancellable.is_cancelled()) {
                        this._showError(error.message || _('Refresh failed.'));
                        console.error(`${this.metadata.name}: refresh failed: ${error.message}`);
                    }
                } finally {
                    if (this._enabled) {
                        this._refreshing = false;
                        this._refreshItem.setSensitive(true);
                    }
                }
            }
        );
    }

    _messageForStatus(status) {
        switch (status) {
        case 401:
            return _('Authentication failed. Check your API key.');
        case 402:
            return _('The account balance is insufficient.');
        case 429:
            return _('Too many requests. Try again later.');
        default:
            return _('DeepSeek returned HTTP %d.').replace('%d', status);
        }
    }

    _showBalance(balance) {
        const usage = this._recordUsage(balance);
        const total = formatMoney(balance.total, balance.currency);
        const spent = formatMoney(usage.spent, balance.currency);
        const granted = formatMoney(balance.granted, balance.currency);
        const toppedUp = formatMoney(balance.toppedUp, balance.currency);

        this._label.text = this._settings.get_boolean('show-estimated-usage')
            ? `${total} · ${_('Today')} ≈${spent}`
            : total;
        this._balanceItem.label.text = _('Balance: %s').replace('%s', total);
        this._usageItem.label.text = _('Today (estimated): %s').replace('%s', spent);
        this._usageItem.visible = this._settings.get_boolean('show-estimated-usage');
        this._breakdownItem.label.text = _('Topped up: %s · Granted: %s')
            .replace('%s', toppedUp)
            .replace('%s', granted);
        this._updatedItem.label.text = _('Updated: %s').replace(
            '%s',
            GLib.DateTime.new_now_local().format('%H:%M:%S')
        );
        this._errorItem.hide();

        const isLow = !balance.available
            || balance.total <= this._settings.get_double('low-balance-threshold');
        if (isLow)
            this._label.add_style_class_name('deepseek-low-balance');
        else
            this._label.remove_style_class_name('deepseek-low-balance');
    }

    _recordUsage(balance) {
        const previous = {
            date: this._settings.get_string('usage-date'),
            currency: this._settings.get_string('usage-currency'),
            lastBalance: this._settings.get_double('usage-last-balance'),
            spent: this._settings.get_double('usage-estimated-spend'),
        };
        const localDate = GLib.DateTime.new_now_local().format('%Y-%m-%d');
        const usage = updateUsageEstimate(previous, balance, localDate);

        this._settings.delay();
        this._settings.set_string('usage-date', usage.date);
        this._settings.set_string('usage-currency', usage.currency);
        this._settings.set_double('usage-last-balance', usage.lastBalance);
        this._settings.set_double('usage-estimated-spend', usage.spent);
        this._settings.apply();

        return usage;
    }

    _showError(message) {
        if (!this._enabled)
            return;

        this._errorItem.label.text = message;
        this._errorItem.show();
        this._updatedItem.label.text = _('Updated: failed');
        this._label.remove_style_class_name('deepseek-low-balance');
        this._refreshing = false;
        this._refreshItem.setSensitive(true);
    }
}
