const { Gio, GLib, GObject } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const Gettext = imports.gettext.domain(Me.metadata['gettext-domain']);
const _ = Gettext.gettext;

const Utils = Me.imports.utils;

const FILE_TYPES = ['png', 'jpg', 'jpeg'];
const STARTUP_DELAY = 3;

let slideshowId, fileMonitor, fileMonitorChangedId, backgroundSettings, timeOfLastSlideTick, timeOfSlideshowInit;

const ColorScheme = {
    DEFAULT: 0,
    DARK: 1,
    LIGHT: 2,
}

const PreserveQueueType = {
    SESSION: 0,
    PERMANENT: 1,
}

function fisherYatesShuffle(array) {
    for (let i = (array.length - 1); i > 0; i -= 1) {
        const randomIndex = Math.floor(Math.random() * (i + 1));
        const b = array[i];
        array[i] = array[randomIndex];
        array[randomIndex] = b;
    }
}

function queryWallpapersExist(wallpaperList) {
    Utils.debugLog('Slideshow: Query Wallpapers Exist');
    for (let i = wallpaperList.length - 1; i >= 0; i--) {
        const imagePath = wallpaperList[i];
        let file = Gio.file_new_for_path(imagePath);
        if (!file.query_exists(null)) {
            Utils.debugLog(`Slideshow: Remove ${imagePath}`);
            wallpaperList.splice(i, 1);
        }
    }
}

function isValidDirectory() {
    const slideshowDirectoryPath = Me.settings.get_string('slideshow-directory');
    const directory = Gio.file_new_for_path(slideshowDirectoryPath);

    if (!slideshowDirectoryPath) {
        Main.notify(_('Slideshow directory not found.'),
            _('Set a directory in settings to begin slideshow'));
        return false;
    }
    else if (!directory.query_exists(null)) {
        Main.notify(_("Slideshow directory doesn't exist."),
            _('Change directory in settings to begin slideshow'));
        return false;
    }

    return true;
}

function initiate() {
    if (!isValidDirectory())
        return;

    createFileMonitor();
    Utils.debugLog('Initiate Wallpaper Slideshow');
    backgroundSettings = new Gio.Settings({ schema: "org.gnome.desktop.background" });

    if (!Me.persistentStorage['wallpapersQueue']) {
        loadSlideshowQueue();
    }
    else {
        queryWallpapersExist(Me.persistentStorage['wallpapersQueue']);
    }

    timeOfSlideshowInit = Date.now();
    startSlideshow(getTimerDelay(), true);
}

function loadSlideshowQueue(createNewList) {
    const preserveQueueType = Me.settings.get_enum('slideshow-preserve-queue');

    if (preserveQueueType === PreserveQueueType.SESSION) {
        Utils.debugLog(`Slideshow: Create New Session Slide Show`);
        Me.persistentStorage['wallpapersQueue'] = getWallpaperList();
        fisherYatesShuffle(Me.persistentStorage['wallpapersQueue']);
    }
    else if (preserveQueueType === PreserveQueueType.PERMANENT) {
        if (Me.settings.get_strv('slideshow-wallpaper-queue').length === 0 || createNewList) {
            Utils.debugLog(`Slideshow: Create New Permananet Slide Show`);
            const wallpaperList = getWallpaperList();
            fisherYatesShuffle(wallpaperList);
            Me.settings.set_strv('slideshow-wallpaper-queue', wallpaperList);
        }
        Utils.debugLog(`Slideshow: Get 'slideshow-wallpaper-queue' saved data`);
        Me.persistentStorage['wallpapersQueue'] = Me.settings.get_strv('slideshow-wallpaper-queue');
    }
}

function getSlideshowStatus() {
    let status = {};
    if (!Me.persistentStorage['wallpapersQueue']) {
        Utils.debugLog('Slideshow: Error - Wallpaper Queue Null');
        status['isNull'] = true;
        status['isEmpty'] = true;
    }
    else if (Me.persistentStorage['wallpapersQueue'].length === 0) {
        Utils.debugLog('Slideshow: Error - Wallpaper Queue Empty');
        status['isNull'] = false;
        status['isEmpty'] = true;
    }
    return status;
}

function startSlideshow(delay = Me.settings.get_int('slideshow-image-duration'), runOnce) {
    endSlideshow();

    Utils.debugLog('Slideshow: Set Frame Timer: ' + delay);

    slideshowId = GLib.timeout_add_seconds(GLib.PRIORITY_LOW, delay, () => {
        let status = getSlideshowStatus();
        if (status.isNull) {
            Utils.debugLog('Slideshow: Error - Stop Timer');
            slideshowId = null;
            return GLib.SOURCE_REMOVE;
        }

        if (status.isEmpty) {
            Utils.debugLog('Slideshow: Wallpaper Queue Empty - Reshuffle');
            loadSlideshowQueue(true);

            status = getSlideshowStatus();
            if (status.isNull || status.isEmpty) {
                Utils.debugLog('Slideshow: Error - Stop Timer');
                slideshowId = null;
                return GLib.SOURCE_REMOVE;
            }

            //Don't want to repeat wallpaper, push to end of queue.
            if (Me.persistentStorage['wallpapersQueue'][0] === Me.persistentStorage['lastWallpaper']) {
                Utils.debugLog('Slideshow: Last Wallpaper == First Shuffled - Push to back');
                let duplicate = Me.persistentStorage['wallpapersQueue'].shift();
                Me.persistentStorage['wallpapersQueue'].push(duplicate);
            }
        }

        const randomWallpaper = Me.persistentStorage['wallpapersQueue'].shift();

        Me.persistentStorage['lastWallpaper'] = randomWallpaper;

        const colorScheme = getCurrentColorScheme();
        if (colorScheme === ColorScheme.DEFAULT || colorScheme === ColorScheme.LIGHT)
            backgroundSettings.set_string('picture-uri', `file://${randomWallpaper}`);
        else if (colorScheme === ColorScheme.DARK)
            backgroundSettings.set_string('picture-uri-dark', `file://${randomWallpaper}`);

        Utils.debugLog(`Slideshow: Set Background - ${randomWallpaper}`);
        Utils.debugLog(`Slideshow: WallPaper Queue Length - ${Me.persistentStorage['wallpapersQueue'].length}`);

        timeOfLastSlideTick = Date.now();
        if (runOnce) {
            Utils.debugLog('Slideshow: Timer Run Once Ended');
            startSlideshow(Me.settings.get_int('slideshow-image-duration'));
            return GLib.SOURCE_REMOVE;
        }
        return GLib.SOURCE_CONTINUE;
    });
}

function endSlideshow() {
    if (slideshowId) {
        Utils.debugLog('Slideshow: End Slideshow');
        GLib.source_remove(slideshowId);
        slideshowId = null;
    }
}

function clearFileMonitor() {
    if (fileMonitor) {
        Utils.debugLog('Slideshow: Clear FileMonitor');
        if (fileMonitorChangedId) {
            Utils.debugLog('Slideshow: Disconnect FileMonitor ChangedId');
            fileMonitor.disconnect(fileMonitorChangedId);
            fileMonitorChangedId = null;
        }
        fileMonitor.cancel();
        fileMonitor = null;
    }
}

function createFileMonitor() {
    clearFileMonitor();

    const slideshowDirectoryPath = Me.settings.get_string('slideshow-directory');
    const dir = Gio.file_new_for_path(slideshowDirectoryPath);
    fileMonitor = dir.monitor_directory(Gio.FileMonitorFlags.WATCH_MOVES, null);
    fileMonitor.set_rate_limit(1000);
    fileMonitorChangedId = fileMonitor.connect('changed', (_monitor, file, otherFile, eventType) => {
        const fileName = file.get_path();
        const newFileName = otherFile?.get_path();
        const wallpapersQueue = Me.persistentStorage['wallpapersQueue'];
        const index = wallpapersQueue.indexOf(fileName);

        switch (eventType) {
            case Gio.FileMonitorEvent.DELETED:
            case Gio.FileMonitorEvent.MOVED_OUT:
                if (index >= 0) {
                    wallpapersQueue.splice(index, 1);
                    Utils.debugLog(`Slideshow: Remove "${fileName}" from index:${index}`);
                }
                break;
            case Gio.FileMonitorEvent.CREATED:
            case Gio.FileMonitorEvent.MOVED_IN:
                //insert new files randomly into wallpapers queue
                const randomIndex = Math.floor(Math.random() * wallpapersQueue.length);
                wallpapersQueue.splice(randomIndex, 0, fileName);
                Utils.debugLog(`Slideshow: Insert "${fileName}" at index:${randomIndex}`);
                break;
            case Gio.FileMonitorEvent.RENAMED:
                if (index >= 0) {
                    wallpapersQueue.splice(index, 1, newFileName);
                    Utils.debugLog(`Slideshow: Rename "${fileName}" at index:${index} to "${newFileName}"`);
                }
                break;
            default:
                break;
        }
    });
}

function getCurrentColorScheme() {
    const colorSchemeSetting = new Gio.Settings({ schema: "org.gnome.desktop.interface" });
    return colorSchemeSetting.get_enum("color-scheme");
}

function getWallpaperList() {
    Utils.debugLog('Slideshow: Get Wallpaper List');

    const wallpaperPaths = [];

    try {
        const slideshowDirectoryPath = Me.settings.get_string('slideshow-directory');
        let dir = Gio.file_new_for_path(slideshowDirectoryPath);

        let fileEnum = dir.enumerate_children('standard::name,standard::type', Gio.FileQueryInfoFlags.NONE, null);

        let info;
        while ((info = fileEnum.next_file(null))) {
            const name = info.get_name();
            const ext = name.split(".").pop();
            if (FILE_TYPES.includes(ext)) {
                const filePath = GLib.build_filenamev([slideshowDirectoryPath, name]);
                wallpaperPaths.push(filePath);
            }
        }
    } catch (e) {
        Utils.debugLog(e);
    }

    return wallpaperPaths;
}

function getTimerDelay() {
    let remainingTimer;
    const preserveQueueType = Me.settings.get_enum('slideshow-preserve-queue');

    if (preserveQueueType === PreserveQueueType.SESSION) {
        remainingTimer = Me.persistentStorage['timerRemaining'] || 0;
    }
    else if (preserveQueueType === PreserveQueueType.PERMANENT) {
        remainingTimer = Me.settings.get_int('slideshow-timer-remaining');
    }

    const imageDuration = Me.settings.get_int('slideshow-image-duration');

    if (remainingTimer === 0 || remainingTimer <= imageDuration) {
        Utils.debugLog('Slideshow: RemainingTimer <= ImageDuration - Use RemaingTimer');
        return Math.max(remainingTimer, 0);
    }

    Utils.debugLog('Slideshow: RemainingTimer exceeded ImageDuration - Use ImageDuration');

    return imageDuration;
}

function getElapsedTime(remainingTimer) {
    const imageDuration = Me.settings.get_int('slideshow-image-duration');
    const dateNow = Date.now();
    let timerRemaining;

    if (!timeOfLastSlideTick) {
        const elapsedTime = Math.floor((dateNow - timeOfSlideshowInit) / 1000);
        timerRemaining = Math.max(remainingTimer - elapsedTime, 0);
        Utils.debugLog(`Slideshow: Slide Hasn't Changed Yet`);
        Utils.debugLog(`Slideshow: ElapsedTime=${elapsedTime}`);
        Utils.debugLog(`Slideshow: TimerRemaining=${timerRemaining}`);
    }
    else {
        const elapsedTime = Math.floor((dateNow - timeOfLastSlideTick) / 1000);
        timerRemaining = Math.max(imageDuration - elapsedTime, 0);
        Utils.debugLog(`Slideshow: Slide Has Changed`);
        Utils.debugLog(`Slideshow: ElapsedTime=${elapsedTime}`);
        Utils.debugLog(`Slideshow: TimerRemaining=${timerRemaining}`);
    }

    return timerRemaining;
}

function destroy(clearAllStorage) {
    let remainingTimer, timerRemaining;

    const imageDuration = Me.settings.get_int('slideshow-image-duration');
    const preserveQueueType = Me.settings.get_enum('slideshow-preserve-queue');

    if (clearAllStorage) {
        Utils.debugLog(`Slideshow: Directory Changed. Clear all storage`);
        delete Me.persistentStorage;
        Me.persistentStorage = {};
        Me.settings.set_strv('slideshow-wallpaper-queue', []);
        Me.settings.set_int('slideshow-timer-remaining', 0);
    }
    else if (preserveQueueType === PreserveQueueType.SESSION) {
        remainingTimer = Me.persistentStorage['timerRemaining'] || imageDuration;
        timerRemaining = getElapsedTime(remainingTimer);

        Me.persistentStorage['timerRemaining'] = timerRemaining;
        //clear out the permanent storage
        Me.settings.set_strv('slideshow-wallpaper-queue', []);
        Me.settings.set_int('slideshow-timer-remaining', 0);
    }
    else if (preserveQueueType === PreserveQueueType.PERMANENT) {
        remainingTimer = Me.settings.get_int('slideshow-timer-remaining');
        timerRemaining = getElapsedTime(remainingTimer);

        Me.settings.set_int('slideshow-timer-remaining', timerRemaining);
        Me.settings.set_strv('slideshow-wallpaper-queue', Me.persistentStorage['wallpapersQueue']);
    }

    endSlideshow();
    clearFileMonitor();
}