# DeepSeek Usage & Balance for GNOME

A GNOME Shell extension that shows your DeepSeek API balance and estimated daily spending in the top bar.

![GNOME 48-50](https://img.shields.io/badge/GNOME-48--50-4A86CF)
![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)

## Features

- Current total, topped-up, and granted balances from DeepSeek's official balance API.
- Estimated spending for the current local day.
- Configurable refresh interval, preferred currency, and low-balance warning.
- API key storage in GNOME Keyring via libsecret—never in GSettings or source files.
- English and Simplified Chinese UI.
- Native GNOME Shell 48, 49, and 50 support.

## Important limitation

DeepSeek currently exposes the account balance but not a daily usage-history endpoint. The extension estimates today's spending by accumulating balance decreases it observes while running. The estimate starts at zero on the first observation of each local day. Top-ups are ignored, but expiring grants can still look like spending.

## Install from source

Ubuntu dependencies are normally already installed with GNOME Shell:

```bash
sudo apt install gnome-shell-extension-prefs gir1.2-secret-1 gir1.2-soup-3.0
```

Build, test, and install:

```bash
make check
make install
gnome-extensions enable deepseek-usage@yuqingli525.github.com
```

Open **Extensions**, select **DeepSeek Usage & Balance**, and paste a DeepSeek API key into the settings window. The key is saved in GNOME Keyring.

If this is the first extension installed in the current session, log out and back in before enabling it.

## Development

```bash
npm test
make pack
```

The distributable extension archive is written to `dist/`.

## Data and privacy

The extension sends one authenticated `GET` request to:

```text
https://api.deepseek.com/user/balance
```

It does not proxy requests through another server and does not collect analytics. See the [official DeepSeek balance API documentation](https://api-docs.deepseek.com/api/get-user-balance/).

## License

MIT
