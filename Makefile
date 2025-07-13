# Basic Makefile

UUID = azwallpaper@azwallpaper.gitlab.com
BASE_MODULES = LICENSE metadata.json README.md RELEASENOTES utils.js
TRANSLATABLE_MODULES = bingWallpaperDownloader.js constants.js extension.js prefs.js slideshow.js updateNotifier.js

TOLOCALIZE = $(TRANSLATABLE_MODULES)
EXTRA_DIRECTORIES = media

MSGSRC = $(wildcard po/*.po)

ifeq ($(strip $(DESTDIR)),)
	INSTALLBASE = $(HOME)/.local/share/gnome-shell/extensions
else
	INSTALLBASE = $(DESTDIR)/usr/share/gnome-shell/extensions
endif

# The command line passed variable VERSION is used to set the version string
# in the generated zip-file. If no VERSION is passed,
# the current commit SHA1 is added to the metadata
ifdef VERSION
	VSTRING = _$(VERSION)
else
	COMMIT = $(shell git rev-parse HEAD)
	VSTRING =
endif

all: extension

clean:
	rm -f ./schemas/gschemas.compiled

extension: ./schemas/gschemas.compiled $(MSGSRC:.po=.mo)

./schemas/gschemas.compiled: ./schemas/org.gnome.shell.extensions.azwallpaper.gschema.xml
	glib-compile-schemas ./schemas/

potfile: ./po/azwallpaper.pot

mergepo: potfile
	for l in $(MSGSRC); do \
		msgmerge -U $$l ./po/azwallpaper.pot; \
	done;

./po/azwallpaper.pot: $(TOLOCALIZE)
	mkdir -p po
	xgettext -k_ -kN_ --from-code utf-8 --add-comments=TRANSLATORS -o po/azwallpaper.pot --sort-by-file --package-name "Wallpaper Slideshow" $(TOLOCALIZE)

./po/%.mo: ./po/%.po
	msgfmt -c $< -o $@

install: install-local

install-local: _build
	rm -rf $(INSTALLBASE)/$(UUID)
	mkdir -p $(INSTALLBASE)/$(UUID)
	cp -r ./_build/* $(INSTALLBASE)/$(UUID)/
	-rm -fR _build
	echo done

prefs enable disable reset info show:
	gnome-extensions $@ $(UUID)

zip-file: _build
	cd _build ; \
	zip -qr "$(UUID)$(VSTRING).zip" .
	mv _build/$(UUID)$(VSTRING).zip ./
	-rm -fR _build

_build: all
	-rm -fR ./_build
	mkdir -p _build
	cp $(BASE_MODULES) $(TRANSLATABLE_MODULES) _build
	cp -r $(EXTRA_DIRECTORIES) _build
	mkdir -p _build/schemas
	cp schemas/*.xml _build/schemas/
	cp schemas/gschemas.compiled _build/schemas/
	mkdir -p _build/locale
	for l in $(MSGSRC:.po=.mo) ; do \
		lf=_build/locale/`basename $$l .mo`; \
		mkdir -p $$lf; \
		mkdir -p $$lf/LC_MESSAGES; \
		cp $$l $$lf/LC_MESSAGES/azwallpaper.mo; \
	done;
ifneq ($(COMMIT),)
	sed -i '/"version": .*,/a "commit": "$(COMMIT)",'  _build/metadata.json;
endif