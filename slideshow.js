import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

import {debugLog, notify} from './utils.js';

const FILE_TYPES = ['png', 'jpg', 'jpeg'];

function fisherYatesShuffle(array) {
    for (let i = array.length - 1; i > 0; i -= 1) {
        const randomIndex = Math.floor(Math.random() * (i + 1));
        const b = array[i];
        array[i] = array[randomIndex];
        array[randomIndex] = b;
    }
}

function isValidDirectory(extension, slideshowDirectory) {
    const directory = Gio.file_new_for_path(slideshowDirectory);

    if (!slideshowDirectory || !directory.query_exists(null)) {
        notify(_('Slideshow directory not found'), _('Change directory in settings to begin slideshow'),
            _('Open Settings'), () => extension.openPreferences());
        return false;
    }

    return true;
}

export const Slideshow = class AzSlideShow {
    constructor(extension) {
        this._extension = extension;
        this._settings = this._extension.settings;
        this._wallpaperQueue = null;
        this._backgroundSettings = new Gio.Settings({schema: 'org.gnome.desktop.background'});
        this._loadSlideshowQueue();
    }

    initiate() {
        const slideshowDirectory = this._settings.get_string('slideshow-directory');
        if (!isValidDirectory(this._extension, slideshowDirectory))
            return;

        debugLog('Initiate slideshow.');
        this._createFileMonitor();
        this._queryWallpapersExist(this._wallpaperQueue);

        this._currentSlideTime = Date.now();

        debugLog('Starting slideshow...');
        const timerDelay = this._getTimerDelay();
        this.startSlideshow(timerDelay, true);
        debugLog(`Wallpapers in queue: ${this._wallpaperQueue.length}`);
        debugLog(`Next slide in ${timerDelay} seconds.`);
    }

    _queryWallpapersExist(wallpaperList) {
        debugLog('Checking if wallpapers exist...');
        const slideshowDirectoryPath = this._settings.get_string('slideshow-directory');
        for (let i = wallpaperList.length - 1; i >= 0; i--) {
            const imageName = wallpaperList[i];
            const filePath = GLib.build_filenamev([slideshowDirectoryPath, imageName]);
            const file = Gio.file_new_for_path(filePath);
            if (!file.query_exists(null)) {
                debugLog(`File not found. Removing ${filePath}`);
                wallpaperList.splice(i, 1);
            }
        }
        debugLog('Check complete!');
    }

    _loadSlideshowQueue(createNewList = false) {
        const wallpaperQueue = this._settings.get_strv('slideshow-wallpaper-queue');
        if (wallpaperQueue.length === 0 || createNewList) {
            const wallpaperList = this._getWallpaperList();
            fisherYatesShuffle(wallpaperList);
            this._settings.set_strv('slideshow-wallpaper-queue', wallpaperList);
        }
        this._wallpaperQueue = this._settings.get_strv('slideshow-wallpaper-queue');
    }

    _getSlideshowStatus() {
        const status = {};
        if (this._wallpaperQueue.length === 0) {
            debugLog('Error - Wallpaper Queue Empty');
            status.isEmpty = true;
        }
        return status;
    }

    startSlideshow(delay = this._settings.get_int('slideshow-image-duration'), runOnce = false) {
        this._endSlideshow();

        const slideshowDirectoryPath = this._settings.get_string('slideshow-directory');

        if (!runOnce)
            debugLog(`Next slide in ${delay} seconds.`);

        this._slideshowId = GLib.timeout_add_seconds(GLib.PRIORITY_LOW, delay, () => {
            const slideshowStatus = this._getSlideshowStatus();

            // 'slideshow-wallpaper-queue' has no wallpapers in queue, try to load a new slideshow queue
            if (slideshowStatus.isEmpty) {
                debugLog('Wallpaper queue empty. Attempting to create new slideshow...');

                this._loadSlideshowQueue(true);
                const newSlideshowStatus = this._getSlideshowStatus();

                // if 'slideshow-wallpaper-queue still empty, cancel slideshow
                if (newSlideshowStatus.isEmpty) {
                    notify(_('Slideshow contains no slides'), _('Change directory in settings to begin slideshow'),
                        _('Open Settings'), () => this._extension.openPreferences());
                    this._slideshowId = null;
                    return GLib.SOURCE_REMOVE;
                }

                debugLog('Success! Starting new slideshow...');
                // If the new wallpaperQueue first entry is the same as the previous wallpaper,
                // remove first entry and push to end of queue.
                if (this._wallpaperQueue[0] === this._settings.get_string('slideshow-current-wallpapper')) {
                    const duplicate = this._wallpaperQueue.shift();
                    this._wallpaperQueue.push(duplicate);
                }
            }

            const randomWallpaper = this._wallpaperQueue.shift();

            this._settings.set_string('slideshow-current-wallpapper', randomWallpaper);
            this._settings.set_strv('slideshow-wallpaper-queue', this._wallpaperQueue);

            debugLog('Changing wallpaper...');

            const filePath = GLib.build_filenamev([slideshowDirectoryPath, randomWallpaper]);

            this._backgroundSettings.set_string('picture-uri', `file://${filePath}`);
            this._backgroundSettings.set_string('picture-uri-dark', `file://${filePath}`);

            debugLog(`Current wallpaper "${randomWallpaper}"`);
            debugLog(`Wallpapers in queue: ${this._wallpaperQueue.length}`);

            this._endSlideTimer();
            this._currentSlideTime = Date.now();
            this._startSlideTimer();

            if (runOnce) {
                this.startSlideshow(this._settings.get_int('slideshow-image-duration'));
                return GLib.SOURCE_REMOVE;
            }

            debugLog(`Next slide in ${delay} seconds.`);
            return GLib.SOURCE_CONTINUE;
        });
    }

    _endSlideshow() {
        if (this._slideshowId) {
            GLib.source_remove(this._slideshowId);
            this._slideshowId = null;
        }
    }

    // Start a timeout to calculate remaining time to next slide
    _startSlideTimer() {
        this._slideTimerId = GLib.timeout_add_seconds(GLib.PRIORITY_LOW, 1, () => {
            const dateNow = Date.now();
            const imageDuration = this._settings.get_int('slideshow-image-duration');
            const elapsedTime = Math.floor((dateNow - this._currentSlideTime) / 1000);
            const remainingTime = Math.max(imageDuration - elapsedTime, 0);
            this._settings.set_int('slideshow-timer-remaining', remainingTime);
            return GLib.SOURCE_CONTINUE;
        });
    }

    _endSlideTimer() {
        if (this._slideTimerId) {
            GLib.source_remove(this._slideTimerId);
            this._slideTimerId = null;
        }
    }

    _clearFileMonitor() {
        if (this._fileMonitor) {
            debugLog('Clear FileMonitor');
            if (this._fileMonitorChangedId) {
                debugLog('Disconnect FileMonitor ChangedId');
                this._fileMonitor.disconnect(this._fileMonitorChangedId);
                this._fileMonitorChangedId = null;
            }
            this._fileMonitor.cancel();
            this._fileMonitor = null;
        }
    }

    _createFileMonitor() {
        this._clearFileMonitor();

        const slideshowDirectoryPath = this._settings.get_string('slideshow-directory');
        const dir = Gio.file_new_for_path(slideshowDirectoryPath);
        this._fileMonitor = dir.monitor_directory(Gio.FileMonitorFlags.WATCH_MOVES, null);
        this._fileMonitor.set_rate_limit(1000);
        this._fileMonitorChangedId = this._fileMonitor.connect('changed', (_monitor, file, otherFile, eventType) => {
            const fileName = file.get_basename();
            const newFileName = otherFile?.get_basename();
            const index = this._wallpaperQueue.indexOf(fileName);

            switch (eventType) {
            case Gio.FileMonitorEvent.DELETED:
            case Gio.FileMonitorEvent.MOVED_OUT:
                if (index >= 0) {
                    this._wallpaperQueue.splice(index, 1);
                    this._settings.set_strv('slideshow-wallpaper-queue', this._wallpaperQueue);
                    debugLog(`Remove "${fileName}" from index:${index}`);
                }
                break;
            case Gio.FileMonitorEvent.CREATED:
            case Gio.FileMonitorEvent.MOVED_IN: {
                // insert new files randomly into wallpapers queue
                const randomIndex = Math.floor(Math.random() * this._wallpaperQueue.length);
                this._wallpaperQueue.splice(randomIndex, 0, fileName);
                this._settings.set_strv('slideshow-wallpaper-queue', this._wallpaperQueue);
                debugLog(`Insert "${fileName}" at index:${randomIndex}`);
                break;
            }
            case Gio.FileMonitorEvent.RENAMED:
                if (index >= 0) {
                    this._wallpaperQueue.splice(index, 1, newFileName);
                    this._settings.set_strv('slideshow-wallpaper-queue', this._wallpaperQueue);
                    debugLog(`Rename "${fileName}" at index:${index} to "${newFileName}"`);
                }
                break;
            default:
                break;
            }
        });
    }

    _getWallpaperList() {
        debugLog('Get Wallpaper List');

        const wallpaperPaths = [];

        try {
            const slideshowDirectoryPath = this._settings.get_string('slideshow-directory');
            const dir = Gio.file_new_for_path(slideshowDirectoryPath);

            const fileEnum = dir.enumerate_children('standard::name,standard::type', Gio.FileQueryInfoFlags.NONE, null);

            let info;
            while ((info = fileEnum.next_file(null))) {
                const name = info.get_name();
                const ext = name.split('.').pop();
                if (FILE_TYPES.includes(ext))
                    wallpaperPaths.push(name);
            }
        } catch (e) {
            debugLog(e);
        }

        return wallpaperPaths;
    }

    _getTimerDelay() {
        const remainingTimer = this._settings.get_int('slideshow-timer-remaining');
        const imageDuration = this._settings.get_int('slideshow-image-duration');

        if (remainingTimer === 0 || remainingTimer <= imageDuration)
            return Math.max(remainingTimer, 0);

        return imageDuration;
    }

    reset() {
        debugLog('Directory Changed. Reset slideshow');
        this._settings.set_strv('slideshow-wallpaper-queue', []);
        this._settings.set_int('slideshow-timer-remaining', 0);

        this._endSlideTimer();
        this._endSlideshow();
        this._clearFileMonitor();
        this._loadSlideshowQueue();
    }

    destroy() {
        this._endSlideTimer();
        this._endSlideshow();
        this._clearFileMonitor();
        this._backgroundSettings = null;
    }
};
