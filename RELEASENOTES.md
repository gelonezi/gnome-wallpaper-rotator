<b><span size="large">Wallpaper Rotator v1.0</span></b>

- First release of this fork of Wallpaper Slideshow v14.3, under its own name and identifier.
- Add option to take the background colours from the wallpaper's edges.
- Add option to keep the image adjustment.
- Add option to include subfolders, with an optional folder-name filter.
- Add optional panel icon with slide controls.
- All new options are off by default.

<b><span size="large">v14.3</span></b>

- Add GNOME 51 Support.
- Show slide controls in desktop context menu.
- Add "Show Image in Files" in desktop context menu.

<b><span size="large">v14.2</span></b>

- Use GResource to bundle extension svg files.
- Remove 'Extension.lookupByURL(import.meta.url)' call for EGO review purposes.

<b><span size="large">v14.1</span></b>

- Add GNOME 50 support.
- Slideshow: debounce wallpaper queue saves on FileMonitor events.
    - Prevents GSettings set_value() spam during bulk file changes.
- Add option to pause slideshow when fullscreen window detected.
- Add option to show notifications when slideshow is paused.

<b><span size="large">v14.0</span></b>

- Slideshow: implement a GLib.idle_add() when changing wallpaper image.
    - Resolves lag issues when changing wallpapers with large file sizes.
- Fix an issue where inserting new images into the queue while paused caused the current wallpaper to change unexpectedly on resume.
- Slideshow directory monitor: file event handling improvements for reliability across all file operations.