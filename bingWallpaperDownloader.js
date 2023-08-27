import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup';

import {Extension, gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

import * as Config from 'resource:///org/gnome/shell/misc/config.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {debugLog} from './utils.js';

const STARTUP_DELAY = 3;
const TWELVE_HOURS_IN_SECONDS = 43200;
const TWELVE_HOURS_IN_MILLISECONDS = 4.32e7;
const SESSION_TYPE = GLib.getenv('XDG_SESSION_TYPE');
const PACKAGE_VERSION = Config.PACKAGE_VERSION;

Gio._promisify(Soup.Session.prototype, 'send_and_read_async');
Gio._promisify(Gio.File.prototype, 'replace_contents_bytes_async', 'replace_contents_finish');

const BingParams = {
    format: 'js', idx: '0', n: '8', mbl: '1', mkt: 'en-US',
};

export const BingWallpaperDownloader = class {
    constructor() {
        this._extension = Extension.lookupByURL(import.meta.url);
        this._settings = this._extension.getSettings();
        this._userAgent = `User-Agent: Mozilla/5.0 (${SESSION_TYPE}; GNOME Shell/${PACKAGE_VERSION}; Linux ${GLib.getenv('CPU')};) AzWallpaper/${this._extension.metadata.version}`;
    }

    initiate() {
        debugLog('Initiate BING Wallpaper downloader');

        this._bingWallpapersDirectory = this._settings.get_string('bing-download-directory');

        if (!this._bingWallpapersDirectory) {
            this._setToDefaultDownloadDirectory();
            Main.notify(_('No directory found for BING wallpaper downloads.'),
                _('Set directory to - %s').format(this._bingWallpapersDirectory));
        } else {
            let dir = Gio.File.new_for_path(this._bingWallpapersDirectory);
            // attempt to make the directory if it doesn't exist
            if (!dir.query_exists(null)) {
                const success = dir.make_directory(null);
                // If making the directory failed, set to default directory
                if (!success) {
                    this._setToDefaultDownloadDirectory();
                    Main.notify(_('Failed to create BING wallpaper downloads directory.'),
                        _('Set directory to - %s').format(this._bingWallpapersDirectory));
                }
            }
        }

        if (this._session == null)
            this._session = new Soup.Session({user_agent: this._userAgent});

        this._startDownloaderTimer(this._getTimerDelay(), true);
    }

    _setToDefaultDownloadDirectory() {
        this._bingWallpapersDirectory = GLib.build_filenamev([GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_PICTURES), 'Bing Wallpapers']);
        this._settings.set_string('bing-download-directory', this._bingWallpapersDirectory);

        let dir = Gio.File.new_for_path(this._bingWallpapersDirectory);
        // attempt to make the directory if it doesn't exist
        if (!dir.query_exists(null))
            dir.make_directory(null);
    }

    _startDownloaderTimer(delay, runOnce) {
        this.endDownloaderTimer();

        debugLog(`BING Wallpaper: Set Download Timer: ${delay}`);
        this._fetchBingWallpaperId = GLib.timeout_add_seconds(GLib.PRIORITY_LOW, delay, () => {
            this._queueDownload().catch(e => debugLog(e));
            this._setLastDataFetch();
            if (runOnce) {
                // Set a 12 hour timer for next data fetch.
                this._startDownloaderTimer(TWELVE_HOURS_IN_SECONDS);
                return GLib.SOURCE_REMOVE;
            } else {
                return GLib.SOURCE_CONTINUE;
            }
        });
    }

    endDownloaderTimer() {
        if (this._fetchBingWallpaperId) {
            GLib.source_remove(this._fetchBingWallpaperId);
            this._fetchBingWallpaperId = null;
        }
    }

    async _queueDownload() {
        debugLog('BING Wallpaper: Queue Download');
        const {jsonData, error} = await this._getJsonData();

        if (!jsonData || error) {
            if (error)
                debugLog(error);
            else
                debugLog('JSON data null');
            return;
        }

        const results = [];
        for (let image of jsonData.images)
            results.push(this._downloadAndSaveImage(image));

        await Promise.all(results).then(value => {
            const {success, err} = value;
            if (success)
                debugLog(success);
            else
                debugLog(err);
        });
    }

    _getElapsedTime() {
        const lastDataFetch = this._settings.get_uint64('bing-last-data-fetch');
        const dateNow = Date.now();

        const elapsedTime = dateNow - lastDataFetch;

        debugLog(`BING Wallpaper: ElapsedTime: ${elapsedTime}`);

        return elapsedTime;
    }

    _getTimerDelay() {
        const lastDataFetch = this._settings.get_uint64('bing-last-data-fetch');
        const elapsedTime = this._getElapsedTime();
        const has12HoursPassed = elapsedTime >= TWELVE_HOURS_IN_MILLISECONDS;

        if (lastDataFetch === 0 || has12HoursPassed) {
            debugLog('BING Wallpaper: 12 hours passed. Get New Data');
            return STARTUP_DELAY;
        }

        const nextDataFetch = Math.floor((TWELVE_HOURS_IN_MILLISECONDS - elapsedTime) / 1000);
        return Math.max(nextDataFetch, STARTUP_DELAY);
    }

    _setLastDataFetch() {
        const dateNow = Date.now();
        this._settings.set_uint64('bing-last-data-fetch', dateNow);

        debugLog(`BING Wallpaper: Set data-fetch-time ${dateNow}`);
    }

    async _getJsonData() {
        let message = Soup.Message.new_from_encoded_form(
            'GET',
            'https://www.bing.com/HPImageArchive.aspx',
            Soup.form_encode_hash(BingParams)
        );
        message.request_headers.append('Accept', 'application/json');

        let info;
        try {
            const bytes = await this._session.send_and_read_async(message, GLib.PRIORITY_DEFAULT, null);

            const decoder = new TextDecoder('utf-8');
            info = JSON.parse(decoder.decode(bytes.get_data()));
            if (message.statusCode === Soup.Status.OK)
                return {jsonData: info};
            else
                return {error: `BING Wallpaper: getJsonData() failed with status code - ${message.statusCode}`};
        } catch (e) {
            return {error: `BING Wallpaper: getJsonData() error - ${e}`};
        }
    }

    async _downloadAndSaveImage(data) {
        const urlBase = data.urlbase;
        const url = `https://bing.com${urlBase}_UHD.jpg`;
        const startDate = data.startdate;
        const fileName = `${startDate}-${urlBase.replace(/^.*[\\/]/, '').replace('th?id=OHR.', '')}_UHD`;

        const filePath = GLib.build_filenamev([this._bingWallpapersDirectory, `${fileName}.jpg`]);
        const file = Gio.file_new_for_path(filePath);

        if (file.query_exists(null))
            return {error: `BING Wallpaper: "${fileName}" already downloaded!`};


        debugLog(`BING Wallpaper: Retrieving "${fileName}" from BING`);

        let message = Soup.Message.new('GET', url);

        let info;
        try {
            const bytes = await this._session.send_and_read_async(message, GLib.PRIORITY_DEFAULT, null);

            if (message.statusCode === Soup.Status.OK) {
                info = bytes.get_data();
                const [success, etag_] = await file.replace_contents_bytes_async(info, null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
                return success ? {success: 'BING Wallpaper: Download Complete!'} : {error: 'BING Wallpaper: Error saving file!"'};
            } else {
                return {error: `BING Wallpaper: Download failed with status code - ${message.statusCode}`};
            }
        } catch (e) {
            return {error: `BING Wallpaper: Download failed - ${e}`};
        }
    }
};
