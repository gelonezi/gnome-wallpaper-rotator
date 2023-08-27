import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {EventEmitter} from 'resource:///org/gnome/shell/misc/signals.js';

import {Extension, gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

import {debugLog} from './utils.js';

const FILE_TYPES = ['png', 'jpg', 'jpeg'];

const PreserveQueueType = {
    SESSION: 0,
    PERMANENT: 1,
};

function fisherYatesShuffle(array) {
    for (let i = array.length - 1; i > 0; i -= 1) {
        const randomIndex = Math.floor(Math.random() * (i + 1));
        const b = array[i];
        array[i] = array[randomIndex];
        array[randomIndex] = b;
    }
}

function isValidDirectory() {
    const extension = Extension.lookupByURL(import.meta.url);
    const settings = extension.getSettings();
    const slideshowDirectoryPath = settings.get_string('slideshow-directory');
    const directory = Gio.file_new_for_path(slideshowDirectoryPath);

    if (!slideshowDirectoryPath) {
        Main.notify(_('Slideshow directory not found.'),
            _('Set a directory in settings to begin slideshow'));
        return false;
    } else if (!directory.query_exists(null)) {
        Main.notify(_("Slideshow directory doesn't exist."),
            _('Change directory in settings to begin slideshow'));
        return false;
    }

    return true;
}

export const Slideshow = class extends EventEmitter {
    constructor() {
        super();
        this._extension = Extension.lookupByURL(import.meta.url);
        this._settings = this._extension.getSettings();
    }

    initiate() {
        if (!isValidDirectory())
            return;

        debugLog('Initiate Wallpaper Slideshow');

        this._createFileMonitor();

        if (!this._backgroundSettings)
            this._backgroundSettings = new Gio.Settings({schema: 'org.gnome.desktop.background'});

        if (!this._extension.persistentStorage['wallpapersQueue'])
            this._loadSlideshowQueue();
        else
            this._queryWallpapersExist(this._extension.persistentStorage['wallpapersQueue']);


        this._timeOfSlideshowInit = Date.now();
        this.startSlideshow(this._getTimerDelay(), true);

        this.emit('slideshow-started');
    }

    _queryWallpapersExist(wallpaperList) {
        debugLog('Slideshow: Query Wallpapers Exist');
        for (let i = wallpaperList.length - 1; i >= 0; i--) {
            const imagePath = wallpaperList[i];
            let file = Gio.file_new_for_path(imagePath);
            if (!file.query_exists(null)) {
                debugLog(`Slideshow: Remove ${imagePath}`);
                wallpaperList.splice(i, 1);
            }
        }
    }

    _loadSlideshowQueue(createNewList) {
        const preserveQueueType = this._settings.get_enum('slideshow-preserve-queue');

        if (preserveQueueType === PreserveQueueType.SESSION) {
            debugLog('Slideshow: Create New Session Slide Show');
            this._extension.persistentStorage['wallpapersQueue'] = this._getWallpaperList();
            fisherYatesShuffle(this._extension.persistentStorage['wallpapersQueue']);
        } else if (preserveQueueType === PreserveQueueType.PERMANENT) {
            if (this._settings.get_strv('slideshow-wallpaper-queue').length === 0 || createNewList) {
                debugLog('Slideshow: Create New Permananet Slide Show');
                const wallpaperList = this._getWallpaperList();
                fisherYatesShuffle(wallpaperList);
                this._settings.set_strv('slideshow-wallpaper-queue', wallpaperList);
            }
            debugLog('Slideshow: Get \'slideshow-wallpaper-queue\' saved data');
            this._extension.persistentStorage['wallpapersQueue'] = this._settings.get_strv('slideshow-wallpaper-queue');
        }
    }

    _getSlideshowStatus() {
        let status = {};
        if (!this._extension.persistentStorage['wallpapersQueue']) {
            debugLog('Slideshow: Error - Wallpaper Queue Null');
            status['isNull'] = true;
            status['isEmpty'] = true;
        } else if (this._extension.persistentStorage['wallpapersQueue'].length === 0) {
            debugLog('Slideshow: Error - Wallpaper Queue Empty');
            status['isNull'] = false;
            status['isEmpty'] = true;
        }
        return status;
    }

    startSlideshow(delay = this._settings.get_int('slideshow-image-duration'), runOnce) {
        this._endSlideshow();

        debugLog(`Slideshow: Set Frame Timer: ${delay}`);

        this._slideshowId = GLib.timeout_add_seconds(GLib.PRIORITY_LOW, delay, () => {
            let status = this._getSlideshowStatus();
            if (status.isNull) {
                debugLog('Slideshow: Error - Stop Timer');
                this._slideshowId = null;
                return GLib.SOURCE_REMOVE;
            }

            if (status.isEmpty) {
                debugLog('Slideshow: Wallpaper Queue Empty - Reshuffle');
                this._loadSlideshowQueue(true);

                status = this._getSlideshowStatus();
                if (status.isNull || status.isEmpty) {
                    debugLog('Slideshow: Error - Stop Timer');
                    this._slideshowId = null;
                    return GLib.SOURCE_REMOVE;
                }

                // Don't want to repeat wallpaper, push to end of queue.
                if (this._extension.persistentStorage['wallpapersQueue'][0] === this._settings.get_string('slideshow-current-wallpapper')) {
                    debugLog('Slideshow: Last Wallpaper == First Shuffled - Push to back');
                    let duplicate = this._extension.persistentStorage['wallpapersQueue'].shift();
                    this._extension.persistentStorage['wallpapersQueue'].push(duplicate);
                }
            }

            const randomWallpaper = this._extension.persistentStorage['wallpapersQueue'].shift();

            this._settings.set_string('slideshow-current-wallpapper', randomWallpaper);

            this._backgroundSettings.set_string('picture-uri', `file://${randomWallpaper}`);
            this._backgroundSettings.set_string('picture-uri-dark', `file://${randomWallpaper}`);

            this.emit('background-changed');

            debugLog(`Slideshow: Set Background - ${randomWallpaper}`);
            debugLog(`Slideshow: WallPaper Queue Length - ${this._extension.persistentStorage['wallpapersQueue'].length}`);

            this._timeOfLastSlideTick = Date.now();
            if (runOnce) {
                debugLog('Slideshow: Timer Run Once Ended');
                this.startSlideshow(this._settings.get_int('slideshow-image-duration'));
                return GLib.SOURCE_REMOVE;
            }
            return GLib.SOURCE_CONTINUE;
        });
    }

    _endSlideshow() {
        if (this._slideshowId) {
            debugLog('Slideshow: End Slideshow');
            GLib.source_remove(this._slideshowId);
            this._slideshowId = null;
        }
    }

    _clearFileMonitor() {
        if (this._fileMonitor) {
            debugLog('Slideshow: Clear FileMonitor');
            if (this._fileMonitorChangedId) {
                debugLog('Slideshow: Disconnect FileMonitor ChangedId');
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
            const fileName = file.get_path();
            const newFileName = otherFile?.get_path();
            const wallpapersQueue = this._extension.persistentStorage['wallpapersQueue'];
            const index = wallpapersQueue.indexOf(fileName);

            switch (eventType) {
            case Gio.FileMonitorEvent.DELETED:
            case Gio.FileMonitorEvent.MOVED_OUT:
                if (index >= 0) {
                    wallpapersQueue.splice(index, 1);
                    debugLog(`Slideshow: Remove "${fileName}" from index:${index}`);
                }
                break;
            case Gio.FileMonitorEvent.CREATED:
            case Gio.FileMonitorEvent.MOVED_IN: {
                // insert new files randomly into wallpapers queue
                const randomIndex = Math.floor(Math.random() * wallpapersQueue.length);
                wallpapersQueue.splice(randomIndex, 0, fileName);
                debugLog(`Slideshow: Insert "${fileName}" at index:${randomIndex}`);
                break;
            }
            case Gio.FileMonitorEvent.RENAMED:
                if (index >= 0) {
                    wallpapersQueue.splice(index, 1, newFileName);
                    debugLog(`Slideshow: Rename "${fileName}" at index:${index} to "${newFileName}"`);
                }
                break;
            default:
                break;
            }
        });
    }

    _getWallpaperList() {
        debugLog('Slideshow: Get Wallpaper List');

        const wallpaperPaths = [];

        try {
            const slideshowDirectoryPath = this._settings.get_string('slideshow-directory');
            const dir = Gio.file_new_for_path(slideshowDirectoryPath);

            const fileEnum = dir.enumerate_children('standard::name,standard::type', Gio.FileQueryInfoFlags.NONE, null);

            let info;
            while ((info = fileEnum.next_file(null))) {
                const name = info.get_name();
                const ext = name.split('.').pop();
                if (FILE_TYPES.includes(ext)) {
                    const filePath = GLib.build_filenamev([slideshowDirectoryPath, name]);
                    wallpaperPaths.push(filePath);
                }
            }
        } catch (e) {
            debugLog(e);
        }

        return wallpaperPaths;
    }

    _getTimerDelay() {
        let remainingTimer;
        const preserveQueueType = this._settings.get_enum('slideshow-preserve-queue');

        if (preserveQueueType === PreserveQueueType.SESSION)
            remainingTimer = this._extension.persistentStorage['timerRemaining'] || 0;
        else if (preserveQueueType === PreserveQueueType.PERMANENT)
            remainingTimer = this._settings.get_int('slideshow-timer-remaining');


        const imageDuration = this._settings.get_int('slideshow-image-duration');

        if (remainingTimer === 0 || remainingTimer <= imageDuration) {
            debugLog('Slideshow: RemainingTimer <= ImageDuration - Use RemaingTimer');
            return Math.max(remainingTimer, 0);
        }

        debugLog('Slideshow: RemainingTimer exceeded ImageDuration - Use ImageDuration');

        return imageDuration;
    }

    _getElapsedTime(remainingTimer) {
        const imageDuration = this._settings.get_int('slideshow-image-duration');
        const dateNow = Date.now();
        let timerRemaining;

        if (!this._timeOfLastSlideTick) {
            const elapsedTime = Math.floor((dateNow - this._timeOfSlideshowInit) / 1000);
            timerRemaining = Math.max(remainingTimer - elapsedTime, 0);
            debugLog('Slideshow: Slide Hasn\'t Changed Yet');
            debugLog(`Slideshow: ElapsedTime=${elapsedTime}`);
            debugLog(`Slideshow: TimerRemaining=${timerRemaining}`);
        } else {
            const elapsedTime = Math.floor((dateNow - this._timeOfLastSlideTick) / 1000);
            timerRemaining = Math.max(imageDuration - elapsedTime, 0);
            debugLog('Slideshow: Slide Has Changed');
            debugLog(`Slideshow: ElapsedTime=${elapsedTime}`);
            debugLog(`Slideshow: TimerRemaining=${timerRemaining}`);
        }

        return timerRemaining;
    }

    destroy(clearAllStorage) {
        let remainingTimer, timerRemaining;

        const imageDuration = this._settings.get_int('slideshow-image-duration');
        const preserveQueueType = this._settings.get_enum('slideshow-preserve-queue');

        if (clearAllStorage) {
            debugLog('Slideshow: Directory Changed. Clear all storage');
            delete this._extension.persistentStorage;
            this._extension.persistentStorage = {};
            this._settings.set_strv('slideshow-wallpaper-queue', []);
            this._settings.set_int('slideshow-timer-remaining', 0);
        } else if (preserveQueueType === PreserveQueueType.SESSION) {
            remainingTimer = this._extension.persistentStorage['timerRemaining'] || imageDuration;
            timerRemaining = this._getElapsedTime(remainingTimer);

            this._extension.persistentStorage['timerRemaining'] = timerRemaining;
            // clear out the permanent storage
            this._settings.set_strv('slideshow-wallpaper-queue', []);
            this._settings.set_int('slideshow-timer-remaining', 0);
        } else if (preserveQueueType === PreserveQueueType.PERMANENT) {
            remainingTimer = this._settings.get_int('slideshow-timer-remaining');
            timerRemaining = this._getElapsedTime(remainingTimer);

            this._settings.set_int('slideshow-timer-remaining', timerRemaining);
            this._settings.set_strv('slideshow-wallpaper-queue', this._extension.persistentStorage['wallpapersQueue']);
        }

        this._endSlideshow();
        this._clearFileMonitor();
    }
};
