# Wallpaper Slideshow Fork Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `gelonezi/gnome-wallpaper-rotator` into a fork of Andrew Zaech's Wallpaper Slideshow with four opt-in features on independent branches, and a package of the combined build.

**Architecture:** Each feature lives on its own branch cut from upstream `main` at `73fa1b0`, with Andrew's identity untouched. Logic that can be pure goes in small new files with no Shell imports, tested under plain `gjs`; edits to his files stay small. `main` merges the four branches, then adds one identity commit and one commit of our own files, and the package is built from it.

**Tech Stack:** GJS (ES modules), GNOME Shell 45–51 extension APIs, GdkPixbuf, Gio, Adw/Gtk 4 for the settings window, GNU Make, ESLint 9, GSettings schemas.

**Spec:** `docs/superpowers/specs/2026-11-20-wallpaper-rotator-fork-design.md`

## Global Constraints

- Upstream is `https://gitlab.com/AndrewZaech/azwallpaper`, base commit `73fa1b0`.
- On the four `feature/*` branches nothing of Andrew's identity changes: name "Wallpaper Slideshow", uuid `azwallpaper@azwallpaper.gitlab.com`, schema `org.gnome.shell.extensions.azwallpaper`, donation links, About and Donate pages.
- Feature branches are independent: none is based on, or imports from, another.
- Every new setting key is named `slideshow-…` and every new feature defaults to off.
- Every user-visible string goes through gettext `_()`; after adding strings, regenerate the template with `make potfile`.
- `npx eslint 'src/**/*.js' 'tests/**/*.js'` passes on every branch (run `npm ci` once first).
- Nothing is created at import time. Everything created in `enable()` is undone in `disable()`: signal connections, timers, file monitors, pending asynchronous loads.
- Roger's wallpapers are Steam card art and must never be added to the repository. Test fixtures are synthetic.
- New code is small and plain: no speculative options, no dead code, comments only where the reason is not obvious.
- Every commit message ends with the line `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>`.
- Steps marked **ROGER** need the human. The executor stops there and hands back to the controlling session; a subagent never performs them.
- Roger has never forked a project before. Before each git step in Tasks 1 and 7, the controlling session tells him what it does and why.

## Review Focus

1. The wallpaper is not a readable local image (empty URI, `https://` URI, file deleted mid-load, SVG or XML slideshow): the colours stay as they were, nothing throws, no load is left running.
2. The screen locks and unlocks while bar colours are active (`disable()` then `enable()`): the user's saved colours are not replaced by colours the extension itself computed.
3. The slideshow tree contains an unreadable folder or a symbolic link that loops back to a parent: the scan finishes and skips them.
4. Subfolders are switched on or off while a queue saved under the other setting exists: the queue is rebuilt, the slide index stays valid, the current wallpaper stays resolvable.
5. The primary monitor changes shape (ultrawide unplugged, laptop panel becomes primary): the colours are recomputed for the new screen.

---

## File Structure

New files (all under `src/` are packaged automatically by `PACKAGE_FILES = … src/*`):

| File | Branch | Responsibility |
|---|---|---|
| `src/barColorMath.js` | bar-colors | Pure: edge averages, gradient extension, act/save decisions. Imports nothing. |
| `src/barColors.js` | bar-colors | `BarColorWatcher`: settings signals, async image load, writes GNOME's colour keys. |
| `src/imageAdjustment.js` | keep-image-adjustment | Pure decision function plus `ImageAdjustmentKeeper`. |
| `src/folderScan.js` | subfolders | `matchesFolderFilter` (pure) and `scanImages` (Gio only). |
| `tests/harness.js` | each branch with tests | Tiny assert helper; byte-identical on every branch so merges are clean. |
| `tests/*.test.js` | per branch | One test file per new source file with pure logic. |

Modified upstream files: `schemas/org.gnome.shell.extensions.azwallpaper.gschema.xml` (new keys), `src/extension.js` (create and destroy the new objects; panel indicator class), `src/prefs.js` (new rows), `src/slideshow.js` (subfolders only), `po/azwallpaper.pot` (regenerated).

---

### Task 1: Build tools and local fork setup

**Files:** none in the repository; git remotes and branches only.

**Interfaces:**
- Produces: remote `upstream`; local branches `feature/bar-colors`, `feature/keep-image-adjustment`, `feature/subfolders`, `feature/panel-indicator`, all at `73fa1b0`; a working `make` and `npx eslint`.

- [ ] **Step 1 (ROGER): install gettext.** `xgettext` and `msgfmt` are missing on this machine and upstream's `Makefile` needs both. Roger runs `sudo apt install gettext`.

- [ ] **Step 2: Add upstream and fetch.**

```bash
git remote add upstream https://gitlab.com/AndrewZaech/azwallpaper.git
git fetch upstream
git rev-parse upstream/main
```
Expected: a hash starting `73fa1b0`. If upstream has moved on, still base every branch on `73fa1b0` and report the newer hash.

- [ ] **Step 3: Create the four feature branches at the base commit, without checking them out.**

```bash
for b in bar-colors keep-image-adjustment subfolders panel-indicator; do git branch feature/$b 73fa1b0; done
git branch --list 'feature/*' -v
```
Expected: four branches, all at `73fa1b0`.

- [ ] **Step 4: Prove the unmodified upstream builds and lints.**

```bash
git switch feature/bar-colors
npm ci
npx eslint 'src/**/*.js'
make zip-file && ls azwallpaper@azwallpaper.gitlab.com.zip && rm azwallpaper@azwallpaper.gitlab.com.zip
```
Expected: eslint prints nothing and exits 0; the zip exists. `node_modules/` must not be committed: if `.gitignore` does not cover it, add `node_modules/` to `.git/info/exclude`, which is local and changes no branch.

- [ ] **Step 5: Check whether a development shell is available.** Run `gnome-shell --devkit --version 2>&1 | head -3` and note in the task report whether it starts. This decides how later tasks are exercised; nothing depends on the answer.

No commit in this task.

---

### Task 2: Bar colour maths

**Branch:** `feature/bar-colors`

**Files:**
- Create: `src/barColorMath.js`, `tests/harness.js`, `tests/barColorMath.test.js`

**Interfaces:**
- Produces:
  - `computeBarFill({pixels, rowstride, nChannels, width, height, screenWidth, screenHeight}) → {shading: 'horizontal'|'vertical', primary: '#rrggbb', secondary: '#rrggbb'}`. `pixels` is a `Uint8Array` laid out as GdkPixbuf does (rows of `rowstride` bytes, `nChannels` bytes per pixel, RGB first).
  - `shouldAct(enabled: boolean, pictureOptions: string) → boolean`: true only for `enabled && pictureOptions === 'scaled'`.
  - `planSavedColors(acting: boolean, saved: string[], current: string[]) → {save: string[]|null, restore: string[]|null}`. `saved` and `current` are `[shading, primary, secondary]`; `saved` is `[]` when nothing is saved.
  - `uriToLocalPath(uri: string) → string|null`: the path for a `file://` URI, `null` for an empty string or any other scheme.
  - `tests/harness.js` exporting `assertEqual(actual, expected, label)` and `done()`.

- [ ] **Step 1: Write `tests/harness.js`** with exactly this content, so it is identical on every branch:

```js
import System from 'system';

let failures = 0;

export function assertEqual(actual, expected, label) {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a === e) {
        print(`ok   ${label}`);
    } else {
        failures += 1;
        printerr(`FAIL ${label}\n     expected ${e}\n     actual   ${a}`);
    }
}

export function done() {
    if (failures > 0)
        System.exit(1);
    print('all tests passed');
}
```

- [ ] **Step 2: Write the failing tests** in `tests/barColorMath.test.js`. A local helper `makeImage(width, height, paint)` returns `{pixels, rowstride, nChannels, width, height}` with `nChannels = 3` and `rowstride = width * 3`, filling `pixels` (a `Uint8Array`) from `paint(x, y) → [r, g, b]`. A second helper `closeTo(actualHex, expectedHex)` returns true when every channel differs by at most 2. Assertions:

```js
// Reference case from the spec: side bars, colours extended outwards.
const sides = makeImage(192, 108, x => x < 4 ? [0x18, 0x1b, 0x0c] : x >= 188 ? [0x2b, 0x48, 0x30] : [200, 10, 10]);
let fill = computeBarFill({...sides, screenWidth: 3440, screenHeight: 1440});
assertEqual(fill.shading, 'horizontal', 'side bars use a horizontal gradient');
assertEqual(closeTo(fill.primary, '#151306'), true, 'left colour extended outwards');
assertEqual(closeTo(fill.secondary, '#2e5036'), true, 'right colour extended outwards');

// 16:9 image on a 16:10 screen (Review Focus 5): bars above and below.
const bands = makeImage(192, 108, (_x, y) => y < 2 ? [10, 20, 30] : y >= 106 ? [40, 50, 60] : [0, 0, 0]);
fill = computeBarFill({...bands, screenWidth: 1536, screenHeight: 960});
assertEqual(fill.shading, 'vertical', 'top and bottom bars use a vertical gradient');

// Same shape as the screen: nothing to extend, raw edge averages.
fill = computeBarFill({...sides, screenWidth: 1920, screenHeight: 1080});
assertEqual([fill.primary, fill.secondary], ['#181b0c', '#2b4830'], 'no extension when the image fills the screen');

// Extension would leave 0–255: channels are clamped.
const harsh = makeImage(192, 108, x => x < 96 ? [0, 0, 0] : [255, 255, 255]);
fill = computeBarFill({...harsh, screenWidth: 3440, screenHeight: 1440});
assertEqual([fill.primary, fill.secondary], ['#000000', '#ffffff'], 'channels clamp to 0-255');

// Alpha channel and row padding are skipped correctly.
// (build the `sides` picture again with nChannels = 4 and rowstride = width * 4 + 8)
assertEqual(closeTo(fillRgbaPadded.primary, '#151306'), true, 'RGBA with padded rows');

assertEqual(shouldAct(true, 'scaled'), true, 'acts when on and Scaled');
assertEqual(shouldAct(true, 'zoom'), false, 'does not act in Zoom');
assertEqual(shouldAct(true, 'centered'), false, 'does not act in Centered');
assertEqual(shouldAct(false, 'scaled'), false, 'does not act when off');

const mine = ['solid', '#112233', '#445566'];
const computed = ['horizontal', '#151306', '#2e5036'];
assertEqual(planSavedColors(true, [], mine), {save: mine, restore: null}, 'starting to act saves the user colours');
assertEqual(planSavedColors(true, mine, computed), {save: null, restore: null}, 'unlock while acting keeps the first save (Review Focus 2)');
assertEqual(planSavedColors(false, mine, computed), {save: null, restore: mine}, 'stopping restores');
assertEqual(planSavedColors(false, [], mine), {save: null, restore: null}, 'idle does nothing');

assertEqual(uriToLocalPath('file:///home/u/a%20b.jpg'), '/home/u/a b.jpg', 'file URI decodes');
assertEqual(uriToLocalPath(''), null, 'empty URI (Review Focus 1)');
assertEqual(uriToLocalPath('https://example.org/a.jpg'), null, 'remote URI (Review Focus 1)');
done();
```

- [ ] **Step 3: Run to verify failure.** `gjs -m tests/barColorMath.test.js` → fails to import `../src/barColorMath.js`.

- [ ] **Step 4: Implement `src/barColorMath.js`.** The algorithm the signature does not determine:

```
EDGE_FRACTION = 0.02
sideBars = width / height <= screenWidth / screenHeight
if sideBars:  strip = max(1, round(width * EDGE_FRACTION))
              first = mean of columns [0, strip), second = mean of columns [width - strip, width)
              shown = width * screenHeight / height, total = screenWidth, shading = 'horizontal'
else:         same with rows, shown = height * screenWidth / width, total = screenHeight, 'vertical'
if 0 < shown < total:
    start = (total - shown) / 2 / total;  span = shown / total
    slope[c] = (second[c] - first[c]) / span
    primary[c] = first[c] - start * slope[c];  secondary[c] = first[c] + (1 - start) * slope[c]
else: primary = first, secondary = second
each channel: round, clamp to 0–255, format as two lowercase hex digits
```

`uriToLocalPath` may use `GLib.filename_from_uri` inside a `try`; that is the only import allowed in this file, and it is not a Shell import.

- [ ] **Step 5: Run to verify pass.** `gjs -m tests/barColorMath.test.js` → every line `ok`, then `all tests passed`, exit 0.

- [ ] **Step 6: Lint and commit.**

```bash
npx eslint 'src/**/*.js' 'tests/**/*.js'
git add src/barColorMath.js tests/harness.js tests/barColorMath.test.js
git commit -m "Add bar colour maths for scaled wallpapers"
```

---

### Task 3: Bar colour watcher and its setting

**Branch:** `feature/bar-colors`

**Files:**
- Create: `src/barColors.js`
- Modify: `schemas/org.gnome.shell.extensions.azwallpaper.gschema.xml`, `src/extension.js` (`enable()`, `disable()`), `src/prefs.js` (the "Background Color Options" group, around lines 349–406), `po/azwallpaper.pot`

**Interfaces:**
- Consumes: everything Task 2 produces.
- Produces: `export class BarColorWatcher { constructor({settings, log}); destroy(); }` where `settings` is the extension's `Gio.Settings` and `log` is `msg => void`. Settings keys `slideshow-bar-colors-from-image` (`b`, default `false`) and `slideshow-bar-colors-saved` (`as`, default `[]`).

- [ ] **Step 1: Add the two keys to the schema**, next to `slideshow-show-quick-settings-entry`, with summaries "Take the background colours from the wallpaper's edges while Image Adjustment is Scaled." and "The user's background colours, kept while the wallpaper colours are in use." Run `glib-compile-schemas --strict --dry-run schemas/` → no output.

- [ ] **Step 2: Implement `BarColorWatcher` in `src/barColors.js`.**
  - Holds `Gio.Settings` for `org.gnome.desktop.background` and `org.gnome.desktop.interface`, and a `Gio.Cancellable` for the load in flight.
  - Connects, with `connectObject(..., this)`: `changed::picture-uri`, `changed::picture-uri-dark`, `changed::picture-options` (background); `changed::color-scheme` (interface); `changed::slideshow-bar-colors-from-image` (extension settings); `monitors-changed` on `Main.layoutManager` (Review Focus 5). All call one `_update()`.
  - `_update()`: read `acting = shouldAct(switch, picture-options nick)`; read `current` colours; apply `planSavedColors(acting, saved, current)` (write `slideshow-bar-colors-saved` on save; on restore write the three GNOME keys and clear the saved key). If not acting, cancel any load and return. Otherwise cancel the previous load and start a new one.
  - Load: `uriToLocalPath` of `picture-uri-dark` when `color-scheme` is `prefer-dark`, else `picture-uri`. `null` → log and return. `Gio.File.read_async` then `GdkPixbuf.Pixbuf.new_from_stream_at_scale_async(stream, 256, 256, true, cancellable)`; promisify both at module level as `slideshow.js` does for its own calls. Close the stream in a `finally`.
  - On success call `computeBarFill` with `pixbuf.get_pixels()`, `get_rowstride()`, `get_n_channels()`, `get_width()`, `get_height()` and `Main.layoutManager.primaryMonitor`'s `width`/`height`; write `color-shading-type`, `primary-color`, `secondary-color` only where different.
  - Any failure other than cancellation: `log(...)` with the path and message, leave the colours alone (Review Focus 1). Cancellation is silent.
  - `destroy()`: cancel the load, disconnect everything, drop the settings objects. It does **not** restore colours.

- [ ] **Step 3: Wire it into `src/extension.js`.** In `enable()` after `this._slideshow` is created: `this._barColorWatcher = new BarColorWatcher({settings: this._settings, log: msg => Logger.log(msg)});`. In `disable()` before `this._slideshow.destroy()`: destroy it and set it to `null`.

- [ ] **Step 4: Add the settings row in `src/prefs.js`.** At the top of `backgroundOptionsGroup`, an `Adw.SwitchRow` titled `_('Match Background Colors to Wallpaper')` with subtitle `_("Takes the colors from the wallpaper's edges. Works while Image Adjustment is 'Scaled'.")`, bound to `slideshow-bar-colors-from-image`. The three existing rows (Fill Type, Primary Color, Secondary Color) are `sensitive` only while `shouldAct(switch, picture-options)` is false; update that on `changed::slideshow-bar-colors-from-image` and on the background settings' `changed::picture-options`.

- [ ] **Step 5: Regenerate the translation template.** `make potfile`, then `git diff --stat po/` shows only `po/azwallpaper.pot` (and `.po` files only if `make potfile` touches them upstream; do not hand-edit translations).

- [ ] **Step 6: Verify.**

```bash
gjs -m tests/barColorMath.test.js
npx eslint 'src/**/*.js' 'tests/**/*.js'
make zip-file && rm azwallpaper@azwallpaper.gitlab.com.zip
```
Expected: tests pass, eslint silent, zip builds. Live behaviour is checked in Task 8.

- [ ] **Step 7: Commit.** `git commit -m "Take background colours from the wallpaper's edges"` with the schema, the two source files, `prefs.js`, `extension.js` and the `.pot`.

---

### Task 4: Keep the image adjustment

**Branch:** `feature/keep-image-adjustment`

**Files:**
- Create: `src/imageAdjustment.js`, `tests/harness.js` (identical to Task 2's), `tests/imageAdjustment.test.js`
- Modify: schema, `src/extension.js`, `src/prefs.js` (the "Image Adjustment" row, lines 338–347), `po/azwallpaper.pot`

**Interfaces:**
- Produces: `adjustmentToRestore(keep: boolean, stored: string, current: string) → string|null`; `export class ImageAdjustmentKeeper { constructor({settings}); destroy(); }`. Keys `slideshow-keep-image-adjustment` (`b`, `false`) and `slideshow-image-adjustment` (`s`, `''`; a `picture-options` nick such as `scaled`, empty meaning "none chosen yet").

- [ ] **Step 1: Write the failing test.**

```js
assertEqual(adjustmentToRestore(true, 'scaled', 'zoom'), 'scaled', 'GNOME reset to Zoom is undone');
assertEqual(adjustmentToRestore(true, 'scaled', 'scaled'), null, 'nothing to do when already right');
assertEqual(adjustmentToRestore(false, 'scaled', 'zoom'), null, 'off means hands off');
assertEqual(adjustmentToRestore(true, '', 'zoom'), null, 'no stored choice, nothing to restore');
done();
```

- [ ] **Step 2: Run to verify failure.** `gjs -m tests/imageAdjustment.test.js` → import error.

- [ ] **Step 3: Implement `src/imageAdjustment.js`.** The pure function goes first and uses no imports. `ImageAdjustmentKeeper` connects `changed::picture-options` on the background settings and `changed::slideshow-keep-image-adjustment` on the extension settings. When the switch turns on and the stored value is empty, it stores the current `picture-options`. On every change it writes back whatever `adjustmentToRestore` returns, if not `null`. `destroy()` disconnects.

- [ ] **Step 4: Run to verify pass.** Same command → `all tests passed`.

- [ ] **Step 5: Add the keys, wire `enable()`/`disable()` as in Task 3 Step 3, and edit `src/prefs.js`.** The existing "Image Adjustment" row's `notify::selected` handler additionally writes the chosen nick to `slideshow-image-adjustment`. Below it, an `Adw.SwitchRow` titled `_('Keep Image Adjustment')` with subtitle `_('Restores the adjustment above when GNOME changes it, for example after choosing a wallpaper in Settings.')`, bound to `slideshow-keep-image-adjustment`.

- [ ] **Step 6: `make potfile`, lint, build, commit.** Same commands as Task 3 Step 6. `git commit -m "Add option to keep the image adjustment"`.

---

### Task 5: Subfolders and folder filter

**Branch:** `feature/subfolders`

**Files:**
- Create: `src/folderScan.js`, `tests/harness.js` (identical), `tests/folderScan.test.js`
- Modify: schema, `src/slideshow.js` (`constructor` 92–131, `_getWallpapersFromDirectory` 312–348, `_clearMonitorDirectory` 541–552, `_monitorDirectory` 554–663), `src/extension.js` (`SlideInfoMenuItem` label only), `src/prefs.js` ("Configure Slideshow" group, after the directory row), `po/azwallpaper.pot`

**Interfaces:**
- Produces:
  - `matchesFolderFilter(relativePath: string, filter: string) → boolean`: empty filter → true; otherwise true only when the folder directly containing the file is named `filter`, ignoring case. A file at the root has no containing folder and does not match a non-empty filter.
  - `async scanImages(rootPath: string, {includeSubfolders: boolean, folderFilter: string}) → {images: Array<{name: string, date: string}>, folders: string[]}`. `name` is the path relative to `rootPath` (a bare file name for files at the root, as upstream stores today). `date` is `time::created` as a string, as upstream stores it. `folders` lists the absolute path of every folder scanned, root first.
  - Keys `slideshow-include-subfolders` (`b`, `false`) and `slideshow-folder-filter` (`s`, `''`).

- [ ] **Step 1: Write the failing tests.** The test builds a tree under `GLib.dir_make_tmp('wsct-XXXXXX')` and removes it at the end. Image files are any bytes in files named `*.png` whose content starts with the 8-byte PNG signature, so the content type resolves to `image/png`.

```
root/a.png
root/notes.txt
root/.hidden/h.png
root/Game One/Trading Cards/c1.png
root/Game One/Backgrounds/b1.png
root/Game Two/trading cards/c2.png
root/loop -> root            (symbolic link to the root)
root/locked/ (mode 000)  containing x.png
```

```js
assertEqual(matchesFolderFilter('Game One/Trading Cards/c1.png', 'trading cards'), true, 'filter ignores case');
assertEqual(matchesFolderFilter('Game One/Backgrounds/b1.png', 'Trading Cards'), false, 'other folder excluded');
assertEqual(matchesFolderFilter('Trading Cards Extra/c.png', 'Trading Cards'), false, 'whole folder name must match');
assertEqual(matchesFolderFilter('a.png', 'Trading Cards'), false, 'root file has no folder');
assertEqual(matchesFolderFilter('a.png', ''), true, 'empty filter accepts all');

let r = await scanImages(root, {includeSubfolders: false, folderFilter: ''});
assertEqual(names(r), ['a.png'], 'upstream behaviour: root images only');

r = await scanImages(root, {includeSubfolders: true, folderFilter: ''});
assertEqual(names(r), ['Game One/Backgrounds/b1.png', 'Game One/Trading Cards/c1.png', 'Game Two/trading cards/c2.png', 'a.png'],
    'tree scan skips hidden, unreadable and linked folders (Review Focus 3)');

r = await scanImages(root, {includeSubfolders: true, folderFilter: 'Trading Cards'});
assertEqual(names(r), ['Game One/Trading Cards/c1.png', 'Game Two/trading cards/c2.png'], 'filter keeps matching folders only');
assertEqual(r.folders[0], root, 'root is listed first');
assertEqual(r.folders.includes(`${root}/Game One/Trading Cards`), true, 'scanned folders are reported');
done();
```
`names(r)` is `r.images.map(i => i.name).sort()`. Restore the mode of `locked` before deleting the tree.

- [ ] **Step 2: Run to verify failure.** `gjs -m tests/folderScan.test.js` → import error.

- [ ] **Step 3: Implement `src/folderScan.js`** with `Gio`/`GLib` only. Enumerate with attributes `standard::name,standard::type,standard::content-type,standard::is-hidden,standard::is-symlink,time::created` and `Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS`. Skip hidden entries and symbolic links to folders; a folder that fails to enumerate is skipped, not fatal. With `includeSubfolders` false, the result must equal what upstream's `_getWallpapersFromDirectory` returns today.

- [ ] **Step 4: Run to verify pass.** `all tests passed`.

- [ ] **Step 5: Use it in `src/slideshow.js`.**
  - `_getWallpapersFromDirectory()` becomes a call to `scanImages` with the two settings; it stores the returned `folders` for the monitor and returns `images`.
  - `_fileMonitor` and `_fileMonitorChangedId` become a `Map` from folder path to `{monitor, changedId}`. `_monitorDirectory()` creates one monitor per stored folder, all sharing the existing handler; `_clearMonitorDirectory()` cancels them all.
  - In the handler, `fileName` and `newFileName` become paths relative to the slideshow directory (`rootDir.get_relative_path(file)`), not base names. An image event is ignored unless `matchesFolderFilter(name, filter)`. When subfolders are on, a `CREATED` or `MOVED_IN` event for a folder triggers `this._restart()`, and so does a `DELETED` or `MOVED_OUT` event for a monitored folder.
  - `changed::slideshow-include-subfolders` and `changed::slideshow-folder-filter` call `this._reset()`, as `changed::slideshow-directory` does (Review Focus 4: his `_updateQueue` then drops names that no longer exist and adds the new ones).
  - Everything else already joins `name` to the directory with `GLib.build_filenamev` and needs no change; confirm for `getCurrentSlide`, `_setPictureUriSettings` and `slideshow-current-wallpaper`.

- [ ] **Step 6: Keep the slide label short.** In `src/extension.js`, `SlideInfoMenuItem` passes the slide name to `getPrettyFileName`; give it the base name (`GLib.path_get_basename(name)`) so a relative path does not widen the menu.

- [ ] **Step 7: Add the two settings rows in `src/prefs.js`** after the "Slideshow Directory" row: an `Adw.SwitchRow` `_('Include Subfolders')` bound to `slideshow-include-subfolders`, and an `Adw.EntryRow` `_('Only Folders Named')` bound to `slideshow-folder-filter`, sensitive only while the switch is on, applying on `apply` (set `show_apply_button: true`) so the queue is not rebuilt on every keystroke.

- [ ] **Step 8: `make potfile`, lint, build, commit.** `git commit -m "Scan subfolders, with an optional folder-name filter"`.

---

### Task 6: Panel indicator

**Branch:** `feature/panel-indicator`

**Files:**
- Modify: schema, `src/extension.js`, `src/prefs.js` (after the quick settings row, line ~323), `po/azwallpaper.pot`

**Interfaces:**
- Consumes: upstream's `SlideInfoMenuItem(slideshow)` and `SlideControlsMenuItem(extension)` (signals `toggle-pause`, `slide-changed`), both already in `src/extension.js`.
- Produces: key `slideshow-show-panel-indicator` (`b`, `false`); class `SlideshowPanelIndicator` in `src/extension.js`.

- [ ] **Step 1: Add the key to the schema** with summary "Adds an icon to the top panel to control the current slide and open settings."

- [ ] **Step 2: Add `SlideshowPanelIndicator` to `src/extension.js`**, beside `SlideshowQuickMenu` and in its style: a `PanelMenu.Button` (`import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js'`) whose child is an `St.Icon` with `icon_name: 'image-x-generic-symbolic'` and `style_class: 'system-status-icon'`. Menu, top to bottom: `SlideInfoMenuItem`; `SlideControlsMenuItem` (its `toggle-pause` flips `slideshow-pause`, exactly as `_modifyBackgroundMenu` does); a separator; `_('Show Image in Files')` calling `showImageInFiles(slideshow.getCurrentSlide().path)`; `_('Slideshow Settings')` calling `extension.openPreferences()`. The icon's `opacity` is 128 while `slideshow.paused`, 255 otherwise, updated on `notify::paused` with `connectObject`.

- [ ] **Step 3: Create and destroy it like the quick settings entry.** A method `_createPanelIndicator()` mirroring `_createQuickSettingsEntry()`: destroy any existing indicator, and if the key is on, create one and call `Main.panel.addToStatusArea(this.uuid, indicator)`. Call it in `enable()`, on `changed::slideshow-show-panel-indicator`, and destroy the indicator in `disable()`. Destroying before re-creating is what prevents the "already exists in the status area" error.

- [ ] **Step 4: Add the settings row** in `src/prefs.js` after `quickSettingsRow`: `Adw.SwitchRow` titled `_('Show Slide Controls in the Top Panel')`, bound to the key.

- [ ] **Step 5: `make potfile`, lint, build, commit.** `git commit -m "Add an optional panel indicator with slide controls"`. There is no pure logic here; behaviour is checked live in Task 8.

---

### Task 7: Integrate on `main`, give the package its identity, publish

**Files:**
- Modify: `metadata.json`, `Makefile` (lines 4–7), `schemas/` (file renamed), `src/prefs.js`, `src/utils.js`, `src/updateNotifier.js`, `README.md`, `RELEASENOTES.md`
- Create: `docs/code-tour.md`, `docs/notes-for-andrew.md`; `docs/superpowers/` carried over

**Interfaces:**
- Consumes: the four finished feature branches.
- Produces: `main` and the zip `gnome-wallpaper-rotator@gelonezi.github.io.zip`.

- [ ] **Step 1: Rebuild `main` from upstream and merge the features.**

```bash
git switch -C main 73fa1b0
for b in bar-colors keep-image-adjustment subfolders panel-indicator; do git merge --no-ff feature/$b -m "Merge feature/$b"; done
```
Conflicts are expected in the schema, `src/prefs.js`, `src/extension.js` and `po/azwallpaper.pot`: keep both sides' additions; for the `.pot`, take either side and run `make potfile` again. `tests/harness.js` must merge without conflict; if it does not, the copies differ and the branch is fixed first.

- [ ] **Step 2: Verify the combination.** All three test files pass, eslint is silent, `make zip-file` builds.

- [ ] **Step 3: The identity commit.** Exactly these changes, nothing else:

| Where | From | To |
|---|---|---|
| `metadata.json` `name` | `Wallpaper Slideshow` | `Wallpaper Rotator` |
| `metadata.json` `uuid` | `azwallpaper@azwallpaper.gitlab.com` | `gnome-wallpaper-rotator@gelonezi.github.io` |
| `metadata.json` `settings-schema` | `org.gnome.shell.extensions.azwallpaper` | `org.gnome.shell.extensions.gnome-wallpaper-rotator` |
| `metadata.json` `url` | his GitLab URL | `https://github.com/gelonezi/gnome-wallpaper-rotator` |
| `metadata.json` `version`, `version-name` | `20`, `14.3` | `1`, `1.0` |
| `metadata.json` `description` | his text | his text plus `\n\nA fork of Wallpaper Slideshow by Andrew Zaech, with proposed features.` |
| `Makefile` `NAME`, `RESOURCES_PATH`, `SETTINGS_SCHEMA`, `UUID` | his values | the matching new values; `GETTEXT_DOMAIN` stays `azwallpaper` |
| schema file | `…azwallpaper.gschema.xml`, schema `id`, `path`, enum `id` | renamed with `git mv`; `gnome-wallpaper-rotator` in all three |
| resource prefix in `src/updateNotifier.js:31`, `src/utils.js:62`, `src/prefs.js:65` and `SCHEMA_PATH` at `src/prefs.js:618` | `/org/gnome/shell/extensions/azwallpaper` | `/org/gnome/shell/extensions/gnome-wallpaper-rotator` |
| `PROJECT_NAME` in `src/utils.js:11`, `src/prefs.js:615` and `:979` | `Wallpaper Slideshow` | `Wallpaper Rotator` |
| About page link rows, `src/prefs.js:774–777` | "%s on GitLab", `${metadata.url}/-/issues` | "%s on GitHub", `${metadata.url}/issues` |
| About page | — | one added row: title `_('A fork of Wallpaper Slideshow by Andrew Zaech, with proposed features')`, linking to `https://gitlab.com/AndrewZaech/azwallpaper` |
| Donate page group title, `src/prefs.js:984` | `Help Support %s` | `_('Support the Original Author')`; his links untouched |

Unchanged: the gettext domain and `po/` files, his logo, the licence texts. Then `make potfile`, tests, eslint, `make zip-file`, and `unzip -p <zip> metadata.json` shows the new uuid. `git commit -m "Give the packaged fork its own identifier"`.

- [ ] **Step 4: Our files.** Bring `docs/superpowers/` over with `git checkout fork-wallpaper-slideshow -- docs/`. Replace `README.md` and prepend an entry to `RELEASENOTES.md`; write the two documents:
  - `README.md`, sections in this order: one-paragraph statement that this is a fork of Wallpaper Slideshow with proposed features; **Credits** (Andrew Zaech, link to his project and to its listing `https://extensions.gnome.org/extension/6281/wallpaper-slideshow/`, a sentence that all slideshow functionality is his work); **What this fork adds** (the four features, each dated 2026-11-20, each saying it is off by default); **Install the package** (download the zip from Releases, `gnome-extensions install --force <zip>`, log out and in, `gnome-extensions enable gnome-wallpaper-rotator@gelonezi.github.io`, enable only one of the two extensions' slideshows); **Build from source** (`sudo apt install gettext make`, `make install`); **Limits** (one colour setting for all monitors, tuned for the primary; acts only in Scaled mode; tested on GNOME 50 only, declared for 45–51 as upstream); **Branches** (the four feature branches, each identity-free, for upstream review); **Licence** (GPL, as upstream).
  - `docs/code-tour.md`: for Roger. One section per feature: which files, what each function does in plain words, why it is built that way, what to say if asked about it.
  - `docs/notes-for-andrew.md`: facts only, no drafted message: what each branch does with its GitHub URL, what was tested and on which GNOME version, that defaults leave his users' behaviour unchanged, and that the changes were written with an AI assistant.
  Commit: `git commit -m "Add fork README, release notes and documentation"`.

- [ ] **Step 5 (ROGER): the forced push.** The controlling session explains: GitHub's `main` currently holds the one Python commit; the new `main` does not continue from it, so GitHub must be told to accept the replacement; the Python commit is not kept. On his go-ahead:

```bash
git push --force-with-lease origin main
git push origin feature/bar-colors feature/keep-image-adjustment feature/subfolders feature/panel-indicator
gh repo edit gelonezi/gnome-wallpaper-rotator --description "Fork of Wallpaper Slideshow for GNOME with proposed features: background colours from the wallpaper, subfolders, panel icon"
```
Then delete the local `fork-wallpaper-slideshow` branch, which was never pushed.

---

### Task 8: Install on Roger's desktop and verify live

**Files:** none in the repository unless a defect is found; a defect is fixed on its feature branch, re-merged into `main` and pushed.

- [ ] **Step 1: Install.** `git switch main && make install`, then `ls ~/.local/share/gnome-shell/extensions/gnome-wallpaper-rotator@gelonezi.github.io/metadata.json`.

- [ ] **Step 2 (ROGER): log out and back in,** then `gnome-extensions enable gnome-wallpaper-rotator@gelonezi.github.io`. On Wayland this is the only way the shell loads a new extension.

- [ ] **Step 3: Remove the Python tool,** so two things are not changing the wallpaper:

```bash
systemctl --user disable --now wallpaper-rotate.timer wallpaper-fit.service
rm -f ~/.local/bin/wallpaper-fit ~/.local/bin/wallpaper-rotate
rm -f ~/.config/systemd/user/wallpaper-fit.service ~/.config/systemd/user/wallpaper-rotate.service ~/.config/systemd/user/wallpaper-rotate.timer
rm -rf ~/.config/systemd/user/wallpaper-rotate.service.d
systemctl --user daemon-reload
```

- [ ] **Step 4: Configure.** First record the current `color-shading-type`, `primary-color` and `secondary-color` of `org.gnome.desktop.background`; checks 5 and 6 compare against them. Then, with `S="gsettings --schemadir $HOME/.local/share/gnome-shell/extensions/gnome-wallpaper-rotator@gelonezi.github.io/schemas"` and `K=org.gnome.shell.extensions.gnome-wallpaper-rotator`: set `slideshow-directory` to `/home/roger/Pictures/wallpapers`, `slideshow-include-subfolders true`, `slideshow-folder-filter 'Trading Cards'`, `slideshow-slide-duration "(1, 0, 0)"`, `slideshow-image-adjustment 'scaled'`, `slideshow-keep-image-adjustment true`, `slideshow-bar-colors-from-image true`, `slideshow-show-panel-indicator true`; and `gsettings set org.gnome.desktop.background picture-options scaled`.

- [ ] **Step 5: Live checklist.** Each line is checked and reported with the command output or what Roger saw:
  1. `$S get $K slideshow-queue` lists as many entries as `find ~/Pictures/wallpapers -path '*/Trading Cards/*' -type f | wc -l` (87 on 2026-11-20), all containing `/Trading Cards/`.
  2. Next slide from the panel icon changes `picture-uri`; within a second `primary-color` and `secondary-color` change, and for `Ori and the Will of the Wisps/Trading Cards/Lupo.jpg` they are within 2 per channel of `#0c0403` and `#240c05`.
  3. The panel icon is visible in Dash to Panel; pause dims it; toggling `slideshow-show-panel-indicator` off and on three times leaves exactly one icon and no error in `journalctl --user -b -g wallpaper-slideshow --since -2min`.
  4. `gsettings set org.gnome.desktop.background picture-options zoom` is back to `scaled` within a second.
  5. Turning `slideshow-bar-colors-from-image` off restores the colours that were set before Step 4; turning it on again recolours.
  6. Lock and unlock the screen, then repeat check 5: the same pre-Step-4 colours come back (Review Focus 2).
  7. `gsettings set org.gnome.desktop.background picture-uri 'file:///nonexistent.jpg'`: colours unchanged, one log line with debug logs on, no JS error in the journal (Review Focus 1). Then go to the next slide.
  8. Turn `slideshow-include-subfolders` off: the queue becomes empty or root-only without errors; turn it on: the count from check 1 again, and the current wallpaper is a real file (Review Focus 4).
  9. `mkdir` a new `Test Game/Trading Cards` folder under the slideshow directory containing a copy of one image: the queue grows by one; delete the folder: back to the count from check 1.
  10. Auto Accent Colour still changes the accent on a slide change.

---

### Task 9: Release and tidy up

- [ ] **Step 1: Build the release zip.** `make zip-file VERSION=1` → `gnome-wallpaper-rotator@gelonezi.github.io_1.zip`. The zip is not committed.

- [ ] **Step 2 (ROGER): approve the release.** A GitHub Release is public. On his go-ahead: `gh release create v1 <zip> --title "Wallpaper Rotator 1" --notes-file <notes>`, the notes being the README's "What this fork adds" section plus the credit line.

- [ ] **Step 3: Hand Roger `docs/notes-for-andrew.md` and `docs/code-tour.md`** and offer a walkthrough of the code tour. Writing to Andrew is Roger's.
