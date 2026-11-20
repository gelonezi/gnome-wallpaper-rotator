import GdkPixbuf from 'gi://GdkPixbuf';
import Gio from 'gi://Gio';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {computeBarFill, planSavedColors, shouldAct, uriToLocalPath} from './barColorMath.js';

Gio._promisify(Gio.File.prototype, 'read_async', 'read_finish');
Gio._promisify(GdkPixbuf.Pixbuf, 'new_from_stream_at_scale_async', 'new_from_stream_finish');

const SAMPLE_SIZE = 256;

/**
 * Keeps the GNOME background colours in line with the edges of a scaled wallpaper.
 */
export class BarColorWatcher {
    /**
     * @param {object} params
     * @param {Gio.Settings} params.settings the extension's settings
     * @param {function(string): void} params.log
     */
    constructor({settings, log}) {
        this._settings = settings;
        this._log = log;
        this._backgroundSettings = new Gio.Settings({schema: 'org.gnome.desktop.background'});
        this._interfaceSettings = new Gio.Settings({schema: 'org.gnome.desktop.interface'});
        this._cancellable = null;

        const update = () => this._update();
        this._backgroundSettings.connectObject(
            'changed::picture-uri', update,
            'changed::picture-uri-dark', update,
            'changed::picture-options', update, this);
        this._interfaceSettings.connectObject('changed::color-scheme', update, this);
        this._settings.connectObject('changed::slideshow-bar-colors-from-image', update, this);
        Main.layoutManager.connectObject('monitors-changed', update, this);

        this._update();
    }

    _update() {
        const acting = shouldAct(
            this._settings.get_boolean('slideshow-bar-colors-from-image'),
            this._backgroundSettings.get_string('picture-options'));
        const saved = this._settings.get_strv('slideshow-bar-colors-saved');
        const current = [
            this._backgroundSettings.get_string('color-shading-type'),
            this._backgroundSettings.get_string('primary-color'),
            this._backgroundSettings.get_string('secondary-color'),
        ];

        const {save, restore} = planSavedColors(acting, saved, current);
        if (save)
            this._settings.set_strv('slideshow-bar-colors-saved', save);
        if (restore) {
            const [shading, primary, secondary] = restore;
            this._setColors(shading, primary, secondary);
            this._settings.set_strv('slideshow-bar-colors-saved', []);
        }

        this._cancellable?.cancel();
        this._cancellable = null;
        if (!acting)
            return;

        this._cancellable = new Gio.Cancellable();
        this._load(this._cancellable);
    }

    async _load(cancellable) {
        const dark = this._interfaceSettings.get_string('color-scheme') === 'prefer-dark';
        const uri = this._backgroundSettings.get_string(dark ? 'picture-uri-dark' : 'picture-uri');
        const path = uriToLocalPath(uri);
        if (!path) {
            this._log(`Bar colours: not a local file: '${uri}'`);
            return;
        }

        try {
            const stream = await Gio.File.new_for_path(path).read_async(0, cancellable);
            let pixbuf;
            try {
                pixbuf = await GdkPixbuf.Pixbuf.new_from_stream_at_scale_async(
                    stream, SAMPLE_SIZE, SAMPLE_SIZE, true, cancellable);
            } finally {
                stream.close(null);
            }

            const {width: screenWidth, height: screenHeight} = Main.layoutManager.primaryMonitor;
            const {shading, primary, secondary} = computeBarFill({
                pixels: pixbuf.get_pixels(),
                rowstride: pixbuf.get_rowstride(),
                nChannels: pixbuf.get_n_channels(),
                width: pixbuf.get_width(),
                height: pixbuf.get_height(),
                screenWidth,
                screenHeight,
            });
            this._setColors(shading, primary, secondary);
        } catch (e) {
            if (!e.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                this._log(`Bar colours: ${path}: ${e.message}`);
        }
    }

    _setColors(shading, primary, secondary) {
        const values = {
            'color-shading-type': shading,
            'primary-color': primary,
            'secondary-color': secondary,
        };
        for (const [key, value] of Object.entries(values)) {
            if (this._backgroundSettings.get_string(key) !== value)
                this._backgroundSettings.set_string(key, value);
        }
    }

    destroy() {
        this._cancellable?.cancel();
        this._cancellable = null;
        this._backgroundSettings.disconnectObject(this);
        this._interfaceSettings.disconnectObject(this);
        this._settings.disconnectObject(this);
        Main.layoutManager.disconnectObject(this);
        this._backgroundSettings = null;
        this._interfaceSettings = null;
        this._settings = null;
    }
}
