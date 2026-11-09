UUID := deepseek-usage@yuqingli525.github.com
SCHEMA := schemas/org.gnome.shell.extensions.deepseek-usage.gschema.xml
DIST := dist
ZIP := $(DIST)/$(UUID).shell-extension.zip
LOCALE := locale/zh_CN/LC_MESSAGES/deepseek-usage.mo

.PHONY: all test check pack install clean

all: check pack

test:
	node --test

check: test
	glib-compile-schemas --strict --dry-run schemas
	gjs -m secret.js

$(LOCALE): translations/zh_CN.po scripts/compile-po.mjs
	mkdir -p $(dir $(LOCALE))
	node scripts/compile-po.mjs translations/zh_CN.po $(LOCALE)

pack: check $(LOCALE)
	mkdir -p $(DIST)
	gnome-extensions pack . --force --out-dir=$(DIST) \
		--schema=$(SCHEMA) \
		--extra-source=balance.js \
		--extra-source=secret.js
	zip -q -r $(ZIP) locale

install: pack
	gnome-extensions install --force $(ZIP)

clean:
	rm -f $(ZIP)
	rm -f $(LOCALE)
