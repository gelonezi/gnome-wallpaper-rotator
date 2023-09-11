import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

/**
 *
 * @param {string} message
 */
export function debugLog(message) {
    const extension = Extension.lookupByURL(import.meta.url);
    const settings = extension.getSettings();
    if (settings.get_boolean('debug-logs'))
        log(`Wallpaper Slideshow: ${message}`);
}
