import GLib from 'gi://GLib';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {Extension, gettext as _, InjectionManager} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as LoginManager from 'resource:///org/gnome/shell/misc/loginManager.js';

import {BingWallpaperDownloader} from './bingWallpaperDownloader.js';
import {Slideshow} from './slideshow.js';
import {SupportNotification} from './supportNotifier.js';

export default class AzWallpaper extends Extension {
    enable() {
        this._settings = this.getSettings();

        this._logger = new Logger(this._settings);

        this._slideshow = new Slideshow(this);
        this._bingWallpaperDownloader = new BingWallpaperDownloader(this);
        this._injectionManager = new InjectionManager();

        this._supportNotification = new SupportNotification(this);

        this._injectionManager.overrideMethod(Main.layoutManager, '_addBackgroundMenu', originalMethod => {
            const azWallpaper = this;
            return function (bgManager) {
                /* eslint-disable-next-line no-invalid-this */
                originalMethod.call(this, bgManager);
                const menu = bgManager.backgroundActor._backgroundMenu;
                azWallpaper._modifyBackgroundMenu(menu);
            };
        });

        this._settings.connectObject('changed::slideshow-slide-duration', () => this._slideshow.durationChanged(), this);
        this._settings.connectObject('changed::slideshow-directory', () => this._slideshow.reset(), this);
        this._settings.connectObject('changed::slideshow-use-absolute-time-for-duration', () => this._slideshow.durationChanged(), this);
        this._settings.connectObject('changed::slideshow-next-slide-bool', () => this._goToNextSlide(), this );
        this._settings.connectObject('changed::slideshow-previous-slide-bool', () => this._goToPreviousSlide(), this );

        this._settings.connectObject('changed::bing-wallpaper-download', () => this._bingWallpaperDownloadChanged(), this);
        this._settings.connectObject('changed::bing-download-directory', () => this._restartBingWallpaperDownloader(), this);
        this._settings.connectObject('changed::bing-wallpaper-market', () => this._restartBingWallpaperDownloader(), this);
        this._settings.connectObject('changed::bing-wallpaper-download-count', () => this._restartBingWallpaperDownloader(), this);
        this._settings.connectObject('changed::bing-wallpaper-resolution', () => this._restartBingWallpaperDownloader(), this);
        this._settings.connectObject('changed::bing-wallpaper-delete-old', () => {
            const [deletionEnabled, daysToDeletion_] = this._settings.get_value('bing-wallpaper-delete-old').deep_unpack();
            if (deletionEnabled)
                this._bingWallpaperDownloader.maybeDeleteOldWallpapers();
            else
                this._settings.set_strv('bing-wallpapers-downloaded', []);
        }, this);

        if (!Main.layoutManager._startingUp) {
            this._startExtension();
        } else {
            Main.layoutManager.connectObject('startup-complete', () =>
                this._startExtension(), this);
        }

        // Connect to a few signals to store the remaining time of a slide.
        // disable() isn't called on shutdown, restart, etc.
        const loginManager = LoginManager.getLoginManager();
        loginManager.connectObject('prepare-for-sleep', () =>
            this._slideshow?.saveTimer(), this);

        global.connectObject('shutdown', () =>
            this._slideshow?.saveTimer(), this);

        global.display.connectObject('x11-display-closing', () =>
            this._slideshow?.saveTimer(), this);
    }

    _startExtension() {
        this._delayStartId = GLib.timeout_add_seconds(GLib.PRIORITY_LOW, 3, () => {
            if (this._settings.get_boolean('bing-wallpaper-download'))
                this._bingWallpaperDownloader.initiate();

            Main.layoutManager._updateBackgrounds();

            this._delayStartId = null;
            return GLib.SOURCE_REMOVE;
        });
    }

    get settings() {
        return this._settings;
    }

    disable() {
        if (this._delayStartId) {
            GLib.source_remove(this._delayStartId);
            this._delayStartId = null;
        }

        this._injectionManager.clear();
        this._injectionManager = null;

        Main.layoutManager._updateBackgrounds();

        const loginManager = LoginManager.getLoginManager();
        loginManager.disconnectObject(this);

        Main.layoutManager.disconnectObject(this);
        global.display.disconnectObject(this);
        global.disconnectObject(this);

        this._logger.destroy();
        this._logger = null;

        this._supportNotification.destroy();
        this._supportNotification = null;
        this._bingWallpaperDownloader.destroy();
        this._bingWallpaperDownloader = null;
        this._slideshow.destroy();
        this._slideshow = null;
        this._settings.disconnectObject(this);
        this._settings = null;
    }

    _bingWallpaperDownloadChanged() {
        this._bingWallpaperDownloader.disable();
        if (this._settings.get_boolean('bing-wallpaper-download'))
            this._bingWallpaperDownloader.initiate();
    }

    _restartBingWallpaperDownloader() {
        this._bingWallpaperDownloader.endSingleDownload();
        this._bingWallpaperDownloader.endDownloadTimer();
        if (this._settings.get_boolean('bing-wallpaper-download')) {
            this._bingWallpaperDownloader.setBingParams();
            this._bingWallpaperDownloader.setDownloadDirectory();
            this._bingWallpaperDownloader.downloadOnceWithDelay();
        }
    }

    _goToNextSlide() {
        if (this._settings.get_boolean('slideshow-next-slide-bool')) {
            this._slideshow.goToNextSlide();
        }
    }

    _goToPreviousSlide() {
        if (this._settings.get_boolean('slideshow-previous-slide-bool')) {
            this._slideshow.goToPreviousSlide();
        }
    }

    _modifyBackgroundMenu(menu) {
        menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem(), 4);

        let menuItem = new PopupMenu.PopupMenuItem(_('Previous Wallpaper'));
        menuItem.connect('activate', () => {
            Logger.log('\'Previous Wallpaper\' clicked.');
            this._slideshow.goToPreviousSlide();
        });
        menu.addMenuItem(menuItem, 5);

        menuItem = new PopupMenu.PopupMenuItem(_('Next Wallpaper'));
        menuItem.connect('activate', () => {
            Logger.log('\'Next Wallpaper\' clicked.');
            this._slideshow.goToNextSlide();
        });
        menu.addMenuItem(menuItem, 6);

        menuItem = new PopupMenu.PopupMenuItem(_('Slideshow Settings'));
        menuItem.connect('activate', () => this.openPreferences());
        menu.addMenuItem(menuItem, 7);
    }

    openPreferences() {
        // Find if an extension preferences window is already open
        const prefsWindow = global.get_window_actors().map(wa => wa.meta_window).find(w => w.wm_class === 'org.gnome.Shell.Extensions');

        if (!prefsWindow) {
            super.openPreferences();
            return;
        }

        // The current prefsWindow belongs to this extension, activate it
        if (prefsWindow.title === this.metadata.name) {
            Main.activateWindow(prefsWindow);
            return;
        }

        // If another extension's preferences are open, close it and open this extension's preferences
        prefsWindow.connectObject('unmanaged', () => {
            super.openPreferences();
            prefsWindow.disconnectObject(this);
        }, this);
        prefsWindow.delete(global.get_current_time());
    }
}

export class Logger {
    constructor(settings) {
        Logger.settings = settings;
    }

    static log(msg) {
        if (Logger.settings?.get_boolean('debug-logs'))
            console.log(`Wallpaper Slideshow: ${msg}`);
    }

    destroy() {
        Logger.settings = null;
    }
}
