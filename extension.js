import GLib from 'gi://GLib';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {Extension, gettext as _, InjectionManager} from 'resource:///org/gnome/shell/extensions/extension.js';

import {BingWallpaperDownloader} from './bingWallpaperDownloader.js';
import {Slideshow} from './slideshow.js';
import {debugLog} from './utils.js';

export default class AzWallpaper extends Extension {
    enable() {
        this._settings = this.getSettings();

        this._slideshow = new Slideshow(this);
        this._bingWallpaperDownloader = new BingWallpaperDownloader(this);
        this._injectionManager = new InjectionManager();

        this._injectionManager.overrideMethod(Main.layoutManager, '_addBackgroundMenu', originalMethod => {
            const azWallpaper = this;
            return function (bgManager) {
                /* eslint-disable-next-line no-invalid-this */
                originalMethod.call(this, bgManager);
                const menu = bgManager.backgroundActor._backgroundMenu;
                azWallpaper._modifyBackgroundMenu(menu);
            };
        });

        this._settings.connectObject('changed::slideshow-image-duration', () => this._slideshow.startSlideshow(), this);
        this._settings.connectObject('changed::slideshow-directory', () => this._slideshowDirectoryChanged(), this);
        this._settings.connectObject('changed::bing-wallpaper-download', () => this._startBingWallpaperDownloader(), this);
        this._settings.connectObject('changed::bing-download-directory', () => this._startBingWallpaperDownloader(), this);

        this._delayStartId = GLib.timeout_add_seconds(GLib.PRIORITY_LOW, 1, () => {
            this._startBingWallpaperDownloader();
            this._slideshow.initiate();
            Main.layoutManager._updateBackgrounds();

            this._delayStartId = null;
            return GLib.SOURCE_REMOVE;
        });
    }

    get settings() {
        return this._settings;
    }

    disable() {
        debugLog('disabled()');

        if (this._delayStartId) {
            GLib.source_remove(this._delayStartId);
            this._delayStartId = null;
        }

        this._injectionManager.clear();
        this._injectionManager = null;
        Main.layoutManager._updateBackgrounds();

        this._bingWallpaperDownloader.endDownloaderTimer();
        this._bingWallpaperDownloader = null;
        this._slideshow.destroy();
        this._slideshow = null;
        this._settings.disconnectObject(this);
        this._settings = null;
    }

    _slideshowDirectoryChanged() {
        this._slideshow.reset();
        this._slideshow.initiate();
    }

    _startBingWallpaperDownloader() {
        this._bingWallpaperDownloader.endDownloaderTimer();
        if (this._settings.get_boolean('bing-wallpaper-download'))
            this._bingWallpaperDownloader.initiate();
    }

    _modifyBackgroundMenu(menu) {
        menu.removeAll();

        let menuItem = new PopupMenu.PopupMenuItem(_('Next Background'));
        menuItem.connect('activate', () => {
            debugLog('\'Next Background\' clicked.');
            this._slideshow.startSlideshow(0, true);
        });
        menu.addMenuItem(menuItem);

        menuItem = new PopupMenu.PopupMenuItem(_('Slideshow Settings...'));
        menuItem.connect('activate', () => this.openPreferences());
        menu.addMenuItem(menuItem);

        menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        menu.addSettingsAction(_('Display Settings'), 'gnome-display-panel.desktop');
        menu.addSettingsAction(_('Settings'), 'org.gnome.Settings.desktop');
    }
}
