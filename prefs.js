import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {clearApiKey, lookupApiKey, storeApiKey} from './secret.js';

export default class DeepSeekUsagePreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        this._settings = this.getSettings();

        const page = new Adw.PreferencesPage({
            title: _('DeepSeek Usage'),
            icon_name: 'network-server-symbolic',
        });
        window.add(page);

        this._addCredentialGroup(page);
        this._addDisplayGroup(page);
        this._addAboutGroup(page);

        window.set_default_size(620, 680);
    }

    _addCredentialGroup(page) {
        const group = new Adw.PreferencesGroup({
            title: _('API credentials'),
            description: _('The API key is stored in GNOME Keyring and is never written to extension settings.'),
        });
        page.add(group);

        const keyRow = new Adw.PasswordEntryRow({
            title: _('DeepSeek API key'),
            show_apply_button: false,
        });
        group.add(keyRow);

        const saveButton = new Gtk.Button({
            label: _('Save'),
            valign: Gtk.Align.CENTER,
            css_classes: ['suggested-action'],
        });
        saveButton.connect('clicked', () => this._saveApiKey(keyRow));
        keyRow.add_suffix(saveButton);
        keyRow.connect('entry-activated', () => this._saveApiKey(keyRow));

        const clearButton = new Gtk.Button({
            label: _('Remove'),
            valign: Gtk.Align.CENTER,
        });
        clearButton.connect('clicked', () => this._clearApiKey(keyRow));
        keyRow.add_suffix(clearButton);

        this._keyStatusRow = new Adw.ActionRow({
            title: _('Keyring status'),
        });
        group.add(this._keyStatusRow);
        this._updateKeyStatus();
    }

    _addDisplayGroup(page) {
        const group = new Adw.PreferencesGroup({
            title: _('Display and refresh'),
        });
        page.add(group);

        const currencyModel = new Gtk.StringList();
        currencyModel.append(_('CNY (¥)'));
        currencyModel.append(_('USD ($)'));
        const currencies = ['CNY', 'USD'];
        const currencyRow = new Adw.ComboRow({
            title: _('Preferred currency'),
            subtitle: _('Used when the API returns more than one currency.'),
            model: currencyModel,
            selected: Math.max(0, currencies.indexOf(this._settings.get_string('currency'))),
        });
        currencyRow.connect('notify::selected', row => {
            this._settings.set_string('currency', currencies[row.selected]);
        });
        group.add(currencyRow);

        const refreshAdjustment = new Gtk.Adjustment({
            lower: 1,
            upper: 1440,
            step_increment: 1,
            page_increment: 10,
            value: this._settings.get_uint('refresh-interval'),
        });
        const refreshSpin = new Gtk.SpinButton({
            adjustment: refreshAdjustment,
            numeric: true,
            valign: Gtk.Align.CENTER,
        });
        refreshSpin.connect('value-changed', widget => {
            this._settings.set_uint('refresh-interval', widget.get_value_as_int());
        });
        const refreshRow = new Adw.ActionRow({
            title: _('Refresh interval'),
            subtitle: _('Minutes'),
        });
        refreshRow.add_suffix(refreshSpin);
        group.add(refreshRow);

        const thresholdAdjustment = new Gtk.Adjustment({
            lower: 0,
            upper: 100000,
            step_increment: 1,
            page_increment: 10,
            value: this._settings.get_double('low-balance-threshold'),
        });
        const thresholdSpin = new Gtk.SpinButton({
            adjustment: thresholdAdjustment,
            digits: 2,
            numeric: true,
            valign: Gtk.Align.CENTER,
        });
        thresholdSpin.connect('value-changed', widget => {
            this._settings.set_double('low-balance-threshold', widget.get_value());
        });
        const thresholdRow = new Adw.ActionRow({
            title: _('Low-balance threshold'),
            subtitle: _('The top-bar text turns red at or below this value.'),
        });
        thresholdRow.add_suffix(thresholdSpin);
        group.add(thresholdRow);

        const usageRow = new Adw.SwitchRow({
            title: _('Show estimated daily spending'),
            subtitle: _('Estimated from balance decreases observed while the extension is running.'),
            active: this._settings.get_boolean('show-estimated-usage'),
        });
        usageRow.connect('notify::active', row => {
            this._settings.set_boolean('show-estimated-usage', row.active);
        });
        group.add(usageRow);

        const iconRow = new Adw.SwitchRow({
            title: _('Show icon'),
            active: this._settings.get_boolean('show-icon'),
        });
        iconRow.connect('notify::active', row => {
            this._settings.set_boolean('show-icon', row.active);
        });
        group.add(iconRow);
    }

    _addAboutGroup(page) {
        const group = new Adw.PreferencesGroup({
            title: _('About'),
        });
        page.add(group);

        group.add(new Adw.ActionRow({
            title: _('Data source'),
            subtitle: 'https://api.deepseek.com/user/balance',
        }));
        group.add(new Adw.ActionRow({
            title: _('Daily spending is an estimate'),
            subtitle: _('Top-ups and expiring grants can affect the estimate. DeepSeek does not expose a daily usage-history API.'),
        }));
    }

    _saveApiKey(row) {
        const apiKey = row.get_text().trim();
        if (!apiKey) {
            this._keyStatusRow.subtitle = _('Enter an API key first.');
            return;
        }

        try {
            if (!storeApiKey(apiKey))
                throw new Error('Keyring rejected the key');

            row.set_text('');
            this._bumpCredentialVersion();
            this._keyStatusRow.subtitle = _('Saved securely in GNOME Keyring.');
        } catch (error) {
            this._keyStatusRow.subtitle = _('Could not save the API key: %s')
                .replace('%s', error.message);
        }
    }

    _clearApiKey(row) {
        try {
            clearApiKey();
            row.set_text('');
            this._bumpCredentialVersion();
            this._keyStatusRow.subtitle = _('No API key is stored.');
        } catch (error) {
            this._keyStatusRow.subtitle = _('Could not remove the API key: %s')
                .replace('%s', error.message);
        }
    }

    _updateKeyStatus() {
        try {
            this._keyStatusRow.subtitle = lookupApiKey()
                ? _('An API key is stored in GNOME Keyring.')
                : _('No API key is stored.');
        } catch (error) {
            this._keyStatusRow.subtitle = _('GNOME Keyring is unavailable: %s')
                .replace('%s', error.message);
        }
    }

    _bumpCredentialVersion() {
        const current = this._settings.get_uint('credential-version');
        this._settings.set_uint('credential-version', (current + 1) >>> 0);
    }
}
