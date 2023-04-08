const { GLib } = imports.gi;
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const {
    backgroundMenu: BackgroundMenu, 
    main: Main, 
    popupMenu: PopupMenu,
} = imports.ui;

const {
    bingWallpaperDownloader: BingWallpaperDownloader, 
    slideshow: Slideshow, 
    utils: Utils,
} = Me.imports;

const Gettext = imports.gettext.domain(Me.metadata['gettext-domain']);
const _ = Gettext.gettext;

let delayStartId, originalAddBgMenu;

function init() {
    ExtensionUtils.initTranslations(Me.metadata['gettext-domain']);
    Me.persistentStorage = {};
}

function enable() {
    Me.settings = ExtensionUtils.getSettings();

    Me.settings.connect('changed::slideshow-image-duration', () => {
        Slideshow.startSlideshow();
    });

    Me.settings.connect('changed::slideshow-directory', () => {
        Main.notify(_('Slideshow directory changed.'),
            Me.settings.get_string('slideshow-directory'));
        Slideshow.destroy(true);
        Slideshow.initiate();
    });

    Me.settings.connect('changed::bing-wallpaper-download', () => {
        BingWallpaperDownloader.endDownloaderTimer();

        if (Me.settings.get_boolean('bing-wallpaper-download'))
            BingWallpaperDownloader.initiate();
    });

    Me.settings.connect('changed::bing-download-directory', () => {
        Main.notify(_('BING wallpaper download directory changed.'),
            Me.settings.get_string('bing-download-directory'));
        BingWallpaperDownloader.endDownloaderTimer();

        if (Me.settings.get_boolean('bing-wallpaper-download'))
            BingWallpaperDownloader.initiate();
    });

    delayStartId = GLib.timeout_add_seconds(GLib.PRIORITY_LOW, 3, () => {
        if (Me.settings.get_boolean('bing-wallpaper-download'))
            BingWallpaperDownloader.initiate();

        Slideshow.initiate();

        delayStartId = null;
        return GLib.SOURCE_REMOVE;
    });

    const bgMangers = Main.layoutManager._bgManagers;

    for (let i = 0; i < bgMangers.length; i++) {
        const menu = bgMangers[i].backgroundActor._backgroundMenu;
        modifyBackgroundMenu(menu);
    }

    originalAddBgMenu = BackgroundMenu.addBackgroundMenu;

    BackgroundMenu.addBackgroundMenu = (actor, layoutManager) => {
        originalAddBgMenu(actor, layoutManager);
        const menu = actor._backgroundMenu;
        modifyBackgroundMenu(menu)
    }
}

function modifyBackgroundMenu(menu) {
    delete menu._settingsActions['gnome-background-panel.desktop'];
    const firstMenuItem = menu.firstMenuItem;
    menu.box.remove_child(firstMenuItem);
    firstMenuItem.destroy();

    menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem(), 0);

    let menuItem = new PopupMenu.PopupMenuItem(_('Next Background'));
    menuItem.connect('activate', () => {
        Utils.debugLog('AzWallpaper - "Next Background" clicked.')
        Slideshow.startSlideshow(0, true);
    });
    menu.addMenuItem(menuItem, 0);

    menuItem = new PopupMenu.PopupMenuItem(_('Slideshow Settings...'));
    menuItem.connect('activate', () => {
        ExtensionUtils.openPrefs();
    });
    menu.addMenuItem(menuItem, 0);
}

function disable() {
    Utils.debugLog('AzWallpaper - disabled()')
    BackgroundMenu.addBackgroundMenu = originalAddBgMenu;
    Main.layoutManager._updateBackgrounds();

    BingWallpaperDownloader.endDownloaderTimer();
    Slideshow.destroy();

    if (delayStartId) {
        GLib.source_remove(delayStartId);
        delayStartId = null;
    }

    Me.settings.run_dispose();
    Me.settings = null;
}