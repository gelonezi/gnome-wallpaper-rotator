import Gio from 'gi://Gio';

/**
 * Decides which picture-options value, if any, should be written back.
 *
 * @param {boolean} keep whether the user asked to keep the image adjustment
 * @param {string} stored the adjustment the user chose, empty if none yet
 * @param {string} current the current picture-options value
 * @returns {string|null} the value to restore, or null to leave it alone
 */
export function adjustmentToRestore(keep, stored, current) {
    if (!keep || !stored || stored === current)
        return null;
    return stored;
}

/**
 * Puts the chosen image adjustment back whenever something else changes it.
 */
export class ImageAdjustmentKeeper {
    /**
     * @param {object} params
     * @param {Gio.Settings} params.settings the extension settings
     */
    constructor({settings}) {
        this._settings = settings;
        this._backgroundSettings = new Gio.Settings({schema_id: 'org.gnome.desktop.background'});

        this._backgroundSettings.connectObject('changed::picture-options', () => this._restore(), this);
        this._settings.connectObject('changed::slideshow-keep-image-adjustment', () => {
            if (this._settings.get_boolean('slideshow-keep-image-adjustment') &&
                !this._settings.get_string('slideshow-image-adjustment')) {
                this._settings.set_string('slideshow-image-adjustment',
                    this._backgroundSettings.get_string('picture-options'));
            }
            this._restore();
        }, this);
    }

    _restore() {
        const value = adjustmentToRestore(
            this._settings.get_boolean('slideshow-keep-image-adjustment'),
            this._settings.get_string('slideshow-image-adjustment'),
            this._backgroundSettings.get_string('picture-options'));

        if (value !== null)
            this._backgroundSettings.set_string('picture-options', value);
    }

    destroy() {
        this._backgroundSettings.disconnectObject(this);
        this._settings.disconnectObject(this);
        this._backgroundSettings = null;
        this._settings = null;
    }
}
