import GLib from 'gi://GLib';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {Extension, gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

import {BingWallpaperDownloader} from './bingWallpaperDownloader.js';
import {Slideshow} from './slideshow.js';
import * as Utils from './utils.js';

export default class AzWallpaper extends Extension {
    constructor(metaData) {
        super(metaData);
        this.persistentStorage = {};
    }

    enable() {
        const settings = this.getSettings();

        this._slideShow = new Slideshow();
        this._slideShow.connectObject('background-changed', () => this._updateBackgroundMenu(), this);
        this._slideShow.connectObject('slideshow-started', () => this._updateBackgroundMenu(), this);

        this._bingWallpaperDownloader = new BingWallpaperDownloader();

        settings.connect('changed::slideshow-image-duration', () => {
            this._slideShow.startSlideshow();
        });

        settings.connect('changed::slideshow-directory', () => {
            Main.notify(_('Slideshow directory changed.'),
                settings.get_string('slideshow-directory'));
            this._slideShow.destroy(true);
            this._slideShow.initiate();
        });

        settings.connect('changed::bing-wallpaper-download', () => {
            this._bingWallpaperDownloader.endDownloaderTimer();

            if (settings.get_boolean('bing-wallpaper-download'))
                this._bingWallpaperDownloader.initiate();
        });

        settings.connect('changed::bing-download-directory', () => {
            Main.notify(_('BING wallpaper download directory changed.'),
                settings.get_string('bing-download-directory'));
            this._bingWallpaperDownloader.endDownloaderTimer();

            if (settings.get_boolean('bing-wallpaper-download'))
                this._bingWallpaperDownloader.initiate();
        });

        this._delayStartId = GLib.timeout_add_seconds(GLib.PRIORITY_LOW, 3, () => {
            if (settings.get_boolean('bing-wallpaper-download'))
                this._bingWallpaperDownloader.initiate();

            this._slideShow.initiate();

            this._delayStartId = null;
            return GLib.SOURCE_REMOVE;
        });
    }

    _updateBackgroundMenu() {
        this._updateBackgroundMenuId = GLib.timeout_add_seconds(GLib.PRIORITY_LOW, 2, () => {
            const bgMangers = Main.layoutManager._bgManagers;

            for (let i = 0; i < bgMangers.length; i++) {
                const menu = bgMangers[i].backgroundActor._backgroundMenu;
                this._modifyBackgroundMenu(menu);
            }
            return GLib.SOURCE_REMOVE;
        });
    }

    disable() {
        Utils.debugLog('AzWallpaper - disabled()');

        if (this._delayStartId) {
            GLib.source_remove(this._delayStartId);
            this._delayStartId = null;
        }

        if (this._updateBackgroundMenuId) {
            GLib.source_remove(this._updateBackgroundMenuId);
            this._updateBackgroundMenuId = null;
        }

        Main.layoutManager._updateBackgrounds();

        this._bingWallpaperDownloader.endDownloaderTimer();
        this._slideShow.destroy();
    }

    _modifyBackgroundMenu(menu) {
        menu.removeAll();

        let menuItem = new PopupMenu.PopupMenuItem(_('Next Background'));
        menuItem.connect('activate', () => {
            Utils.debugLog('AzWallpaper - "Next Background" clicked.');
            this._slideShow.startSlideshow(0, true);
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
