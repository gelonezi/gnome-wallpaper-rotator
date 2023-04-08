const { Gio, GLib, GObject, Soup } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const Main = imports.ui.main;
const Utils = Me.imports.utils;

const Gettext = imports.gettext.domain(Me.metadata['gettext-domain']);
const _ = Gettext.gettext;

const STARTUP_DELAY = 3;
const TWELVE_HOURS_IN_SECONDS = 43200;
const TWELVE_HOURS_IN_MILLISECONDS = 4.32e7;
const SESSION_TYPE = GLib.getenv('XDG_SESSION_TYPE');
const PACKAGE_VERSION = imports.misc.config.PACKAGE_VERSION;
const USER_AGENT = `User-Agent: Mozilla/5.0 (${SESSION_TYPE}; GNOME Shell/${PACKAGE_VERSION}; Linux ${GLib.getenv('CPU')};) AzWallpaper/${Me.metadata.version}`;

Gio._promisify(Soup.Session.prototype, 'send_and_read_async');
Gio._promisify(Gio.File.prototype, 'replace_contents_bytes_async', 'replace_contents_finish');

const BingParams = {
    format: 'js', idx: '0', n: '8', mbl: '1', mkt: 'en-US',
};

var fetchBingWallpaperId, bingWallpapersDirectory, session = null;

function initiate() {
    Utils.debugLog('Initiate BING Wallpaper downloader');

    bingWallpapersDirectory = Me.settings.get_string('bing-download-directory');

    if (!bingWallpapersDirectory) {
        setToDefaultDownloadDirectory();
        Main.notify(_('No directory found for BING wallpaper downloads.'),
            _('Set directory to - %s').format(bingWallpapersDirectory));
    }
    else {
        let dir = Gio.File.new_for_path(bingWallpapersDirectory);
        //attempt to make the directory if it doesn't exist
        if (!dir.query_exists(null)) {
            const success = dir.make_directory(null);
            //If making the directory failed, set to default directory
            if (!success) {
                setToDefaultDownloadDirectory();
                Main.notify(_("Failed to create BING wallpaper downloads directory."),
                    _('Set directory to - %s').format(bingWallpapersDirectory));
            }
        }
    }

    if (session == null)
        session = new Soup.Session({ user_agent: USER_AGENT });

    startDownloaderTimer(getTimerDelay(), true);
}

function setToDefaultDownloadDirectory() {
    bingWallpapersDirectory = GLib.build_filenamev([GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_PICTURES), "Bing Wallpapers"]);
    Me.settings.set_string('bing-download-directory', bingWallpapersDirectory);

    let dir = Gio.File.new_for_path(bingWallpapersDirectory);
    //attempt to make the directory if it doesn't exist
    if (!dir.query_exists(null))
        dir.make_directory(null);
}

function startDownloaderTimer(delay, runOnce) {
    endDownloaderTimer();

    Utils.debugLog('BING Wallpaper: Set Download Timer: ' + delay)
    fetchBingWallpaperId = GLib.timeout_add_seconds(GLib.PRIORITY_LOW, delay, () => {
        queueDownload().catch(e => Utils.debugLog(e));
        setLastDataFetch();
        if (runOnce) {
            //Set a 12 hour timer for next data fetch.
            startDownloaderTimer(TWELVE_HOURS_IN_SECONDS);
            return GLib.SOURCE_REMOVE;
        }
        else {
            return GLib.SOURCE_CONTINUE;
        }
    });
}

function endDownloaderTimer() {
    if (fetchBingWallpaperId) {
        GLib.source_remove(fetchBingWallpaperId);
        fetchBingWallpaperId = null;
    }
}

async function queueDownload() {
    Utils.debugLog('BING Wallpaper: Queue Download');
    const { jsonData, error } = await getJsonData(session);

    if (!jsonData || error) {
        if (error)
            Utils.debugLog(error);
        else
            Utils.debugLog('JSON data null');
        return;
    }

    for (let image of jsonData.images) {
        const { success, error } = await downloadAndSaveImage(session, image);
        if (success) {
            Utils.debugLog(success);
        }
        else {
            Utils.debugLog(error);
        }
    }
}

function getElapsedTime() {
    const lastDataFetch = Me.settings.get_uint64('bing-last-data-fetch');
    const dateNow = Date.now();

    const elapsedTime = dateNow - lastDataFetch;

    Utils.debugLog(`BING Wallpaper: ElapsedTime: ${elapsedTime}`);

    return elapsedTime;
}

function getTimerDelay() {
    const lastDataFetch = Me.settings.get_uint64('bing-last-data-fetch');
    const elapsedTime = getElapsedTime();
    const has12HoursPassed = elapsedTime >= TWELVE_HOURS_IN_MILLISECONDS;

    if (lastDataFetch === 0 || has12HoursPassed) {
        Utils.debugLog(`BING Wallpaper: 12 hours passed. Get New Data`);
        return STARTUP_DELAY;
    }

    const nextDataFetch = Math.floor((TWELVE_HOURS_IN_MILLISECONDS - elapsedTime) / 1000);
    return Math.max(nextDataFetch, STARTUP_DELAY);
}

function setLastDataFetch() {
    const dateNow = Date.now();
    Me.settings.set_uint64('bing-last-data-fetch', dateNow);

    Utils.debugLog(`BING Wallpaper: Set data-fetch-time ${dateNow}`);
}

async function getJsonData(session) {
    let message = Soup.Message.new_from_encoded_form(
        'GET',
        'https://www.bing.com/HPImageArchive.aspx',
        Soup.form_encode_hash(BingParams)
    );
    message.request_headers.append('Accept', 'application/json');

    let info;
    try {
        const bytes = await session.send_and_read_async(message, GLib.PRIORITY_DEFAULT, null);

        const decoder = new TextDecoder('utf-8');
        info = JSON.parse(decoder.decode(bytes.get_data()));
        if (message.statusCode === Soup.Status.OK)
            return { jsonData: info };
        else {
            return { error: `BING Wallpaper: getJsonData() failed with status code - ${message.statusCode}` };
        }

    } catch (e) {
        return { error: `BING Wallpaper: getJsonData() error - ${e}` };
    }
}

async function downloadAndSaveImage(session, data) {
    const urlBase = data.urlbase;
    const url = `https://bing.com${urlBase}_UHD.jpg`
    const startDate = data.startdate;
    const fileName = startDate + '-' + urlBase.replace(/^.*[\\\/]/, '').replace('th?id=OHR.', '') + '_UHD'

    const filePath = GLib.build_filenamev([bingWallpapersDirectory, `${fileName}.jpg`]);
    const file = Gio.file_new_for_path(filePath);

    if (file.query_exists(null)) {
        return { error: `BING Wallpaper: "${fileName}" already downloaded!` };
    }

    Utils.debugLog(`BING Wallpaper: Retrieving "${fileName}" from BING`);

    let message = Soup.Message.new('GET', url);

    let info;
    try {
        const bytes = await session.send_and_read_async(message, GLib.PRIORITY_DEFAULT, null);

        if (message.statusCode === Soup.Status.OK) {
            info = bytes.get_data();
            const [success, _etag] = await file.replace_contents_bytes_async(info, null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
            return success ? { success: `BING Wallpaper: Download Complete!` } : { error: `BING Wallpaper: Error saving file!"` };
        }
        else {
            return { error: `BING Wallpaper: Download failed with status code - ${message.statusCode}` };
        }
    } catch (e) {
        return { error: `BING Wallpaper: Download failed - ${e}` };
    }
}