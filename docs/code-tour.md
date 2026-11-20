# Code tour

A walk through everything this fork adds to Wallpaper Slideshow, written so
you can explain any of it to Andrew. It describes the code on `main`. Each
feature lives on its own branch with the same code, minus the other three
features.

Some ground rules apply to all four, because Andrew's extension is on
extensions.gnome.org and its review rules bind anything he takes:

- Every feature is off by default, so nothing changes for his users until
  they switch it on.
- New setting keys start with `slideshow-`, like his.
- Every visible string goes through `_()` and is in `po/azwallpaper.pot`.
- Nothing is created when a file is imported. Whatever `enable()` creates,
  `disable()` destroys: signal connections, file monitors and pending loads.
  `disable()` also runs every time the screen locks, which matters below.
- Pure logic sits in small functions with no GNOME Shell imports, so it can
  be tested with plain `gjs`. The tests are in `tests/`; run each with
  `gjs -m tests/<name>.test.js`. `tests/harness.js` is a tiny shared helper
  (`assertEqual`, `done`), identical on each branch that has tests. The panel
  icon has no pure logic and no tests.

How the features plug in: in `src/extension.js`, `enable()` creates the
colour watcher and the adjustment keeper right after the slideshow, and the
panel icon right after his quick settings entry. `disable()` destroys the
panel icon next to the quick settings entry, and the watcher and keeper just
before the slideshow is destroyed.

## 1. Background colours from the wallpaper

Branch `feature/bar-colors`. Setting `slideshow-bar-colors-from-image`.

### Files

- `src/barColorMath.js`: the maths, no GNOME Shell imports.
- `src/barColors.js`: the `BarColorWatcher` class that reacts to changes and
  writes GNOME's colour keys.
- `src/prefs.js`: one switch, "Match Background Colors to Wallpaper", in the
  Background Color Options group, and a little code that greys out his manual
  colour rows while the feature is in charge.
- `src/extension.js`: creates and destroys the watcher.
- Schema: `slideshow-bar-colors-from-image` (off) and
  `slideshow-bar-colors-saved` (a list of three strings, empty when nothing
  is saved).
- `tests/barColorMath.test.js`.

### What the functions do

In `barColorMath.js`:

- `computeBarFill(image)` takes the pixels of a small copy of the wallpaper
  and the screen size. If the image is narrower in shape than the screen,
  the bars are at the sides: it averages a strip 2% of the width at the left
  and right edges and chooses a horizontal gradient. Otherwise it averages
  the top and bottom strips and chooses a vertical one. GNOME's gradient runs
  across the whole screen, but the image only covers the middle, so it then
  extends the two colours outward along the same straight line. That way the
  gradient is exactly the edge colour where the picture starts and ends. Each
  channel is clamped to 0–255 and the result is returned as hex strings.
- `meanColor` and `toHex` are its two helpers.
- `shouldAct(enabled, pictureOptions)` is true only when the switch is on and
  Image Adjustment is `scaled`.
- `planSavedColors(acting, saved, current)` decides whether to save your own
  colours (when the feature starts acting and nothing is saved yet) or to put
  them back (when it stops acting and something is saved).
- `uriToLocalPath(uri)` turns a `file://` URI into a path, or returns `null`
  for anything else, such as an `https` address.

In `barColors.js`, `BarColorWatcher`:

- The constructor listens to `picture-uri`, `picture-uri-dark`,
  `picture-options`, the dark/light `color-scheme`, its own switch and
  `monitors-changed`, then runs `_update()` once.
- `_update()` asks `shouldAct`, saves or restores your colours as
  `planSavedColors` says, cancels any image load still running, and starts a
  new load if the feature is acting.
- `_load()` picks the dark or light wallpaper URI, reads the file
  asynchronously and has GdkPixbuf decode it scaled to about 256 pixels on the
  long side, also asynchronously. It then takes the primary monitor's size,
  calls `computeBarFill` and writes the result.
- `_setColors()` writes `color-shading-type`, `primary-color` and
  `secondary-color`, each only if it differs from the current value.
- `destroy()` cancels a running load and disconnects everything.

### Why it is built this way

- Only Scaled: it is the one mode where the bars show and the geometry is the
  one the maths assumes. In other modes either no background shows, or it
  shows but a colour you chose on purpose must not be overwritten.
- Your colours are saved when the feature starts acting and put back when it
  stops. They are not put back in `destroy()`, because that runs at every
  screen lock; doing it there would swap colours back and forth on each lock
  and could save computed colours as if they were yours.
- The load is asynchronous and scaled down so a large image does not freeze
  the shell. The colours are worked out with the same algorithm as the old
  Python tool, whose results at full size and on a 256-pixel copy were
  compared on 87 images during the design; the extension's own GdkPixbuf
  path was not measured that way.
- A new wallpaper or `disable()` cancels the previous load, so a slow load can
  never write colours for an old image or run after the extension is off.
- Files that cannot be read (an `https` URI, a deleted file, an SVG or XML
  slideshow) are logged and leave the colours as they were.
- The logger is passed in rather than imported from `extension.js`, so
  `barColors.js` does not import the entry point.
- `monitors-changed` is watched so the colours are worked out again when the
  primary monitor changes shape.

### If asked

- "Why not draw a blurred fill?" That would mean drawing the background
  ourselves. This uses GNOME's own two-colour gradient and only changes
  three existing keys.
- "Why only the primary monitor?" GNOME has one set of background colours
  for all monitors, so one shape has to be chosen.
- "What happens on screen lock?" The watcher is destroyed and created again.
  The saved colours stay in the setting, so your colours are not lost and the
  computed ones are not mistaken for yours.

## 2. Keep Image Adjustment

Branch `feature/keep-image-adjustment`. Setting
`slideshow-keep-image-adjustment`.

### Files

- `src/imageAdjustment.js`: the pure function and the `ImageAdjustmentKeeper`
  class.
- `src/prefs.js`: the "Keep Image Adjustment" switch under his Image
  Adjustment row, and a one-line addition to that row so it also stores the
  chosen value.
- `src/extension.js`: creates and destroys the keeper.
- Schema: `slideshow-keep-image-adjustment` (off) and
  `slideshow-image-adjustment` (the value to keep, empty until one is chosen).
- `tests/imageAdjustment.test.js`.

### What the functions do

- `adjustmentToRestore(keep, stored, current)` returns the stored value when
  the switch is on, a value is stored and it differs from the current one;
  otherwise `null`.
- `ImageAdjustmentKeeper` listens to GNOME's `picture-options`. When it
  changes, `_restore()` writes the stored value back if
  `adjustmentToRestore` says so.
- When the switch is turned on and nothing is stored yet, the keeper stores
  the current adjustment first, so turning it on never changes the picture.
- The keeper also runs `_restore()` once when it is created, at `enable()`.
- In prefs, the Image Adjustment row now stores the chosen value in
  `slideshow-image-adjustment` before writing GNOME's key. The order matters:
  the extension sees the new choice before it sees the adjustment change, so
  it does not put the old one back.

### Why it is built this way

- GNOME resets the adjustment to Zoom whenever a wallpaper is picked in
  Settings or Files. That was the original complaint.
- The value is stored in a key of ours because his row writes GNOME's key
  directly; without our copy there would be no way to tell your choice apart
  from GNOME's reset.
- The restore at `enable()` was added during review: if the adjustment
  changed while the extension was disabled, for example while the screen was
  locked, it is put back as soon as the extension starts again.

### If asked

- "Does it fight the user?" Only when the switch is on, and only towards the
  value chosen in this extension's own Image Adjustment row. Changing that row
  changes what is kept.
- "Why not just set it after each slide?" GNOME's reset comes from outside
  the slideshow; watching the key catches every source.

## 3. Include Subfolders

Branch `feature/subfolders`. Settings `slideshow-include-subfolders` and
`slideshow-folder-filter`.

### Files

- `src/folderScan.js`: the folder walk and the folder-name filter, no GNOME
  Shell imports.
- `src/slideshow.js`: uses the new scan, keeps one file monitor per folder,
  and adds or removes one folder's images when that folder appears or goes.
- `src/extension.js`: the slide name shown in the menus is now the file name
  only, not the relative path.
- `src/prefs.js`: "Include Subfolders" switch and "Only Folders Named" entry,
  which is applied with its apply button and is greyed out while subfolders
  are off.
- `tests/folderScan.test.js`: builds a synthetic folder tree in a temporary
  folder, including an unreadable folder and a symbolic link looping back to
  a parent.

### What the functions do

In `folderScan.js`:

- `matchesFolderFilter(relativePath, filter)` is true when the filter is
  empty, or when the folder directly containing the file has that name,
  ignoring case. Images in the top folder do not match a non-empty filter.
- `scanImages(rootPath, options)` walks the folder, breadth first. With
  subfolders off it reads only the top folder, like before. With subfolders
  on it also walks into subfolders, skipping hidden folders and symbolic
  links to folders. A subfolder that cannot be read is skipped quietly; only
  a failure on the top folder is logged, as before. Image names are returned
  relative to the top folder (for example `Game/Trading Cards/Lupo.jpg`).
  It calls `onFolder` with each folder just before reading it. With
  `startPath` it reads only that folder under the top folder and its
  subfolders, still naming images relative to the top folder.
- Hidden image files are kept by the scan, as in upstream's scan; only hidden
  folders are skipped.

In `slideshow.js`:

- `_getWallpapersFromDirectory()` now calls `scanImages`. When asked, it adds
  a file monitor for each folder just before that folder is read.
- `_addFolderMonitor`, `_removeFolderMonitors` and `_clearMonitorDirectory`
  manage a map of folder path to monitor. Upstream had a single monitor.
- The monitor handler in `_monitorDirectory()` now works with names relative
  to the top folder instead of bare file names, and applies the folder filter
  to new and renamed files.
- A folder created or moved in (not hidden, not a link) goes to
  `_addFolder()`. It scans just that folder and its subfolders, monitoring
  each before reading it, and passes each image to upstream's `_addToQueue`,
  which places it (randomly in Random order, sorted otherwise) and starts the
  slideshow if the queue was empty.
- A monitored folder deleted or moved out goes to `_removeFolder()`. It drops
  the monitors at and below that folder and passes each queued image under it
  to upstream's `_removeFromQueue`, which keeps the current slide index right
  and resets the slideshow if the queue empties.
- A folder renamed in place does both: the old path out, the new path in.
  The top folder itself being renamed, deleted, moved or unmounted still
  restarts the slideshow, as upstream does.
- After each wait (reading file details, scanning a folder) the handler
  checks that its monitors are still the current ones, so nothing runs on a
  slideshow that was destroyed, reset or restarted meanwhile.
- Turning subfolders on or off, or applying a new filter, resets the queue
  (`_reset()`), the same as changing the folder.

### Why it is built this way

- Relative paths in the queue: everything downstream already joins the queue
  name to the slideshow folder, so a relative path works there unchanged,
  sorting A–Z sorts by path, and the saved queue keeps working.
- Symbolic links to folders are not followed, so a link pointing back to a
  parent cannot make the scan loop. Hidden folders (such as `.thumbnails`)
  are skipped.
- Changes made during review:
  - Folder events change only the affected folder's images instead of
    restarting the slideshow. A restart would jump to another slide and
    reshuffle whenever a folder was added or renamed.
  - Working one folder at a time reuses upstream's `_addToQueue` and
    `_removeFromQueue`, so there is no separate merge to keep in step with
    them. An earlier version rescanned the whole tree; it was replaced to
    keep the change to `slideshow.js` small and readable.
  - Each folder's monitor is set before the folder is read, so a file written
    during the scan is caught either by the scan or by the monitor.

### If asked

- "What if the tree has a loop or a folder I cannot read?" The scan skips
  both and finishes; the test covers each.
- "Is it slower?" With subfolders off, the scan reads the same single folder
  as before. With it on, it reads each folder once, asynchronously, 100
  entries at a time, like upstream's loop.
- "Why a monitor per folder?" GIO's directory monitor is not recursive.

## 4. Panel icon

Branch `feature/panel-indicator`. Setting `slideshow-show-panel-indicator`.

### Files

- `src/extension.js`: the `SlideshowPanelIndicator` class and
  `_createPanelIndicator()`.
- `src/prefs.js`: the "Show Slide Controls in the Top Panel" switch, next to
  his quick settings switch.
- Schema: `slideshow-show-panel-indicator` (off).

### What the functions do

- `_createPanelIndicator()` removes any existing icon, then adds a new one if
  the switch is on, with `Main.panel.addToStatusArea`. It runs at `enable()`
  and whenever the switch changes; `disable()` destroys the icon.
- `SlideshowPanelIndicator` is a `PanelMenu.Button` with an image icon. Its
  menu reuses his `SlideInfoMenuItem` (slide number and name) and
  `SlideControlsMenuItem` (previous, pause/resume, next), then adds "Show
  Image in Files" and "Slideshow Settings".
- `_updatePauseState()` dims the icon to half opacity while the slideshow is
  paused. `_togglePause()` flips `slideshow-pause`, as his quick menu does.

### Why it is built this way

- `addToStatusArea` is the supported way to add a panel icon, and the one
  Dash to Panel picks up.
- Reusing his two menu item classes keeps the menu identical to his quick
  settings menu and adds little new code. They are in the same file, so no
  export was needed.
- His quick settings entry is untouched; the icon is an extra option.

### If asked

- "Why not put it in quick settings?" It already is there in his code; some
  people, and Dash to Panel users, want one click in the panel instead.

## The package identity (main only)

A single commit on `main`, "Give the packaged fork its own identifier", changes the
name to Wallpaper Rotator, the identifier to
`gnome-wallpaper-rotator@gelonezi.github.io`, the settings schema, its path
and the resource path to `gnome-wallpaper-rotator`, and the project and issue
links to GitHub. It adds an About row crediting Andrew and retitles the
Donate group "Support the Original Author". Donations go to Andrew, so the
Donate page and its PayPal link still name Wallpaper Slideshow, and his
donation links stay. Update notices use the name Wallpaper Rotator. The
gettext domain, translations, logo and licence are his, unchanged.

This is so the package does not install over his extension, is not replaced
by his next release from extensions.gnome.org, and does not send bug reports
to his tracker. The feature branches do not have this commit.
