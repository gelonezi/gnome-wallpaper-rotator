# Notes for Andrew

Facts to draw on when writing to Andrew Zaech about these features. This is
not a message.

## The branches

Each branch starts from his `main` at commit `73fa1b0` (version 14.3), is
independent of the others, and leaves his name, identifier, schema, About
and Donate pages and donation links unchanged. Any one can be taken without
the rest. Every new setting is off by default, so with the branches merged
his users see no change until they switch a feature on.

- **Background colours from the wallpaper**:
  <https://github.com/gelonezi/gnome-wallpaper-rotator/tree/feature/bar-colors>.
  While Image Adjustment is Scaled, sets GNOME's background shading and two
  colours from the image's edges, so the bars continue the picture. Saves
  the user's own colours and restores them when switched off or when the
  adjustment leaves Scaled; does not restore on `disable()`, which runs at
  each screen lock. Loads a 256-pixel copy asynchronously and cancels it on
  a new wallpaper or `disable()`. New files `src/barColorMath.js` and
  `src/barColors.js`; one switch in prefs. Key
  `slideshow-bar-colors-from-image`, plus `slideshow-bar-colors-saved`.
- **Keep Image Adjustment**:
  <https://github.com/gelonezi/gnome-wallpaper-rotator/tree/feature/keep-image-adjustment>.
  Puts the adjustment chosen in his Image Adjustment row back when something
  else changes `picture-options` (GNOME resets it to Zoom when a wallpaper is
  picked in Settings or Files). Also restores once at `enable()`, to undo a
  change made while the extension was disabled. New file
  `src/imageAdjustment.js`; one switch in prefs and one line added to his
  Image Adjustment row. Keys `slideshow-keep-image-adjustment` and
  `slideshow-image-adjustment`.
- **Include Subfolders**:
  <https://github.com/gelonezi/gnome-wallpaper-rotator/tree/feature/subfolders>.
  Scans subfolders of the slideshow folder, with an optional filter on the
  name of the folder containing each image (ignoring case). The queue stores
  paths relative to the slideshow folder. Hidden folders and symbolic links
  to folders are skipped; hidden image files are kept, as his scan does.
  One file monitor per folder, each set before that folder is read. A folder
  that appears is scanned on its own and its images go through his
  `_addToQueue`; a folder that goes away has its images removed through his
  `_removeFromQueue`; a rename does both. The slideshow is not restarted and
  the current slide stays. New file `src/folderScan.js`; changes in
  `src/slideshow.js`; two rows in prefs. Keys `slideshow-include-subfolders`
  and `slideshow-folder-filter`.
- **Panel icon**:
  <https://github.com/gelonezi/gnome-wallpaper-rotator/tree/feature/panel-indicator>.
  A `PanelMenu.Button` added with `Main.panel.addToStatusArea`, reusing his
  `SlideInfoMenuItem` and `SlideControlsMenuItem`, plus "Show Image in Files"
  and "Slideshow Settings". The icon dims while paused. His quick settings
  entry is unchanged. Changes only in `src/extension.js` and one switch in
  prefs. Key `slideshow-show-panel-indicator`.

## Size of each branch

`git diff --stat 73fa1b0 feature/<name>` totals (most of the deletions are
line-number churn in the regenerated `po/azwallpaper.pot`):

- `feature/bar-colors`: 8 files changed, 476 insertions, 96 deletions.
- `feature/keep-image-adjustment`: 7 files changed, 193 insertions, 62
  deletions.
- `feature/subfolders`: 8 files changed, 495 insertions, 159 deletions
  (`src/slideshow.js`: 145 insertions, 63 deletions).
- `feature/panel-indicator`: 4 files changed, 159 insertions, 69 deletions.

## Testing

- Unit tests for the pure logic, run with `gjs -m tests/<name>.test.js`:
  the colour maths (including a reference case taken from an earlier Python
  implementation), the image adjustment decision, and the folder scan
  on a synthetic tree with a hidden folder, an unreadable folder and a
  symbolic link looping to its parent. No real wallpapers are in the
  repository.
- His ESLint configuration passes on every branch:
  `npx eslint 'src/**/*.js' 'tests/**/*.js'` (only `src/` on the panel
  icon branch, which has no tests).
- `make zip-file` builds on every branch.
- Run on GNOME Shell 50.1, Wayland, Ubuntu 26.04, with a 3440×1440 primary
  monitor and a 1536×960 secondary one, and with Dash to Panel. Not tested
  on GNOME 45 to 49 or 51; `shell-version` is left as his.

## Other facts

- The changes were written with an AI assistant (Claude, by Anthropic).
  The commits carry a `Co-Authored-By` line saying so.
  `docs/code-tour.md` explains every addition in plain words.
- The three branches with pure logic add a `tests/` folder with a small
  shared helper, `tests/harness.js`, identical on each. The panel icon
  branch has no tests.
- New strings are marked for translation and `po/azwallpaper.pot` is
  regenerated on each branch; no translations were added.
- The fork's `main` also carries a single commit that renames the package
  (Wallpaper Rotator, `gnome-wallpaper-rotator@gelonezi.github.io`) so it
  installs beside his extension and is not replaced by his updates. His
  Donate page and links stay in it, and its About page links to his project.
  That commit is not on the feature branches.
