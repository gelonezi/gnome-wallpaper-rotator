const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

function debugLog(message) {
    if (Me.settings.get_boolean('debug-logs'))
        log(`azWallpaper - ${message}`);
}