# Wallpaper Rotator

This repository is a fork of Wallpaper Slideshow, a GNOME Shell extension by
Andrew Zaech, with four proposed features added. It is packaged under its own
name and identifier, Wallpaper Rotator, so it can be installed beside the
original without replacing it. The features are offered to the original
project on separate branches.

## Credits

Wallpaper Slideshow is the work of Andrew Zaech:

- Project: <https://gitlab.com/AndrewZaech/azwallpaper>
- Listing on GNOME Extensions: <https://extensions.gnome.org/extension/6281/wallpaper-slideshow/>

All of the slideshow functionality (the queue, the timer, the Bing wallpaper
download, the settings window, the quick settings menu and the desktop menu)
is his work. His translators and contributors are credited on his project
page. To support him, use the links on the Donate page of the extension's
settings, or on his project page.

Thanks also to everyone who contributed to Wallpaper Slideshow and translated
it; their translations still ship in this package (see
[his README](https://gitlab.com/AndrewZaech/azwallpaper/-/blob/main/README.md)).

## What this fork adds

Each feature is off by default. With all four off, the extension behaves as
Wallpaper Slideshow does.

- **Background colours from the wallpaper** (2026-11-20). While Image
  Adjustment is Scaled, the colours of the bars beside or above and below
  the image are taken from the image's own edges. Your own colours are kept
  and put back when the option is switched off or the adjustment changes.
  Off by default.
- **Keep Image Adjustment** (2026-11-20). GNOME resets the adjustment to
  Zoom when a wallpaper is picked in Settings or Files. With this option on,
  the extension puts the chosen adjustment back. Off by default.
- **Include Subfolders** (2026-11-20). The slideshow also uses images in the
  subfolders of the chosen folder, optionally only those in folders with a
  given name, such as `Trading Cards`. Off by default.
- **Panel icon** (2026-11-20). An icon in the top panel with the current
  image, previous, pause and next, "Show Image in Files" and the settings.
  Off by default.

## Install the package

1. Download the zip file attached to the latest release on the
   [Releases page](https://github.com/gelonezi/gnome-wallpaper-rotator/releases/latest)
   of this repository.
2. Install it, giving the path of the file you downloaded:

   ```bash
   gnome-extensions install --force <downloaded zip>
   ```

3. Log out and back in.
4. Enable it:

   ```bash
   gnome-extensions enable gnome-wallpaper-rotator@gelonezi.github.io
   ```

If Wallpaper Slideshow is also installed, use the slideshow of only one of
the two extensions, or they will both change the wallpaper.

## Build from source

```bash
sudo apt install gettext make zip libglib2.0-bin
make install
```

Then log out and back in, and enable it as above. `make zip-file` builds the
zip instead.

## Limits

- The background colour setting is one for all monitors, and the colours
  are worked out for the primary monitor's shape.
- Background colours are only set while Image Adjustment is Scaled.
- Tested on GNOME 50 only. Declared for GNOME 45 to 51, as upstream.

## Branches

Each feature is also on its own branch, based directly on upstream and free
of this fork's name and identifier, for review by the upstream author:

- [`feature/bar-colors`](https://github.com/gelonezi/gnome-wallpaper-rotator/tree/feature/bar-colors)
- [`feature/keep-image-adjustment`](https://github.com/gelonezi/gnome-wallpaper-rotator/tree/feature/keep-image-adjustment)
- [`feature/subfolders`](https://github.com/gelonezi/gnome-wallpaper-rotator/tree/feature/subfolders)
- [`feature/panel-indicator`](https://github.com/gelonezi/gnome-wallpaper-rotator/tree/feature/panel-indicator)

## Licence

GPL, as upstream: the licence text is in `LICENSE`, and the About page says
GNU General Public License, version 2 or later.
