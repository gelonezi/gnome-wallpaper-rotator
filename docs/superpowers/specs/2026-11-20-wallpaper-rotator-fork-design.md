# A fork of Wallpaper Slideshow with bar colours, subfolders and a panel icon

Design, 2026-11-20, fourth revision. Status: approved by Roger on
2026-11-20; the repository and package names were changed by him after
approval.

Decisions marked **(Roger)** are his. Decisions marked **(my call)** are
Claude's proposals and can be changed in review.

## Intent

Roger built a small Python tool for his own desktop: it keeps the GNOME
wallpaper in fit mode, colours the empty bars beside the image from the
image's own edges, and rotates wallpapers hourly.

An established extension, Wallpaper Slideshow by Andrew Zaech (GPL, about
145,000 downloads, GNOME 45 to 51), already does wallpaper rotation well but
lacks those extras. Roger chose to fork it and add them **(Roger)**.

The fork has three purposes **(Roger)**:

1. Run on Roger's own desktop, replacing the Python tool.
2. Serve as a working demonstration for Andrew. Roger will write to him
   himself and ask him to consider adopting the features in the original.
3. Be installable, as a package, by anyone else who wants this version.

Roger will **not** publish a listing of his own on extensions.gnome.org
**(Roger)**. An earlier revision of this design aimed at that and renamed
the extension; that goal is dropped.

## Goals

1. The four features below, working on Roger's desktop from a build of the
   fork.
2. Each feature on its own branch, based directly on Andrew's code, small,
   in his code style and passing his lint rules, so he can take any of them
   and leave the rest.
3. Every new feature **off by default**, so adopting one changes nothing
   for his existing users until they switch it on.
4. A README that says plainly what this repository is: a fork with
   proposed features. It credits Andrew first and points to the original.
5. A package of the fork that installs beside the official extension
   without interfering with it.

## Non-goals

- A listing of our own on extensions.gnome.org.
- Drawing the background ourselves (blurred fill, per-monitor colours). The
  bars stay GNOME's own two-colour gradient.
- Changing Andrew's queue, timing or Bing download logic.
- Translating the new strings. They are marked translatable and ship in
  English.
- Keeping the Python tool. It is deleted from the repository **(Roger)**.

## Anti-goals

- Passing the fork off as the original: a package that installs under
  Andrew's identifier, or that sends its users' bug reports to him.
- A diff so invasive that Andrew cannot review it or take one feature
  without the others.
- Leaving Andrew unaware that the changes were written with an AI
  assistant. See "Constraints".

## Constraints

### The AI-generated code rule

extensions.gnome.org's review rules (read 2026-11-20 at
<https://gjs.guide/extensions/review-guidelines/review-guidelines.html>)
say extensions must not be AI-generated: AI may be used as a development
tool, but the submitter must be able to justify and explain the code.

If Andrew merges these features, that rule falls on him as the submitter.
So:

- Roger tells him, in his own message, that the changes were written with
  an AI assistant. The commits keep their `Co-Authored-By` lines.
- The additions stay small and plain.
- The work includes a written walkthrough of every addition
  (`docs/code-tour.md`), so Roger can explain the code to Andrew.

### Other review rules that still bind the code

Andrew's extension is on the site, so anything offered to him must respect
its rules: nothing created at import time; everything made in `enable()`
undone in `disable()`, including timers, signal connections and pending
asynchronous loads; readable JavaScript only.

### Licence

Upstream ships the GPL version 3 text as `LICENSE` and its About page says
"GNU General Public License, version 2 or later". The fork keeps both
unchanged. Roger's MIT `LICENSE` covered only the Python tool and goes with
it. The GPL asks that modified versions say they were modified and when;
the README's change list does that.

### This machine

- GNOME Shell 50.1 on Wayland, Ubuntu 26.04. A changed extension is only
  reloaded by logging out and in, or by running a separate development
  shell (`gnome-shell --devkit` is offered by this build; whether it runs
  here is not yet checked).
- Only GNOME 50 can be tested here.
- The primary monitor is the 3440×1440 ultrawide; a 1536×960 laptop panel
  is secondary.
- Roger uses Dash to Panel, which replaces the top panel. The panel icon
  must show up there too.
- Roger also uses Auto Accent Colour, which reacts to wallpaper changes by
  itself and needs nothing from us.

## Approaches considered

How to get the features to GNOME users:

1. **Wrap the Python scripts in a thin extension.** Rejected: the site
   requires JavaScript.
2. **Keep Python, ship a `.deb`.** Rejected at the time because it never
   appears on the Extensions site.
3. **Write our own extension from scratch.** Basic rotation only, one
   tested GNOME version, all of it new AI-written code.
4. **Fork Wallpaper Slideshow and add what is missing.** Chosen
   **(Roger)**.

What shape the fork takes, now that Roger will not publish it himself:

- **Own identity on every branch** (own name, identifier and settings
  throughout). It rewrites names across the `Makefile`, schema, resources
  and five source files, which Andrew would have to untangle from the
  features.
- **Contribution fork**: Andrew's identity untouched, features on separate
  branches. Chosen **(Roger)**, because it is the form Andrew can most
  easily accept.

## What upstream is today

Read from `https://gitlab.com/AndrewZaech/azwallpaper` at commit `73fa1b0`
(version 14.3, 147 commits). About 2,900 lines of JavaScript:

| File | Lines | Role |
|---|---|---|
| `src/extension.js` | 416 | Entry point, quick settings toggle, desktop right-click menu entries |
| `src/slideshow.js` | 923 | Folder scan, queue, timer, sets `picture-uri` |
| `src/prefs.js` | 1037 | Settings window, About and Donate pages |
| `src/bingWallpaperDownloader.js` | 311 | Bing image of the day |
| `src/updateNotifier.js` | 115 | "New version" notification |
| `src/utils.js`, `src/constants.js` | 115 | Helpers |

Facts that shape the design:

- The folder scan (`_getWallpapersFromDirectory`) lists only the images
  directly inside `slideshow-directory`. The queue stores bare file names,
  later joined to the directory with `GLib.build_filenamev`. Its file
  monitor watches that one directory.
- The wallpaper is changed by writing `picture-uri` and `picture-uri-dark`
  in `org.gnome.desktop.background`. This does not reset the scaling mode.
- The settings window already exposes GNOME's "Image Adjustment" and the
  two background colours with their shading type, as manual controls that
  write GNOME's keys directly.
- It never reads image pixels.
- Controls (previous, pause, next, settings) live in a quick settings toggle
  and in the desktop right-click menu. There is no panel icon. The menu
  item classes `SlideInfoMenuItem` and `SlideControlsMenuItem` are not
  exported from `extension.js`.
- It has no `session-modes` entry, so `disable()` runs every time the
  screen locks.
- It builds with a `Makefile` (`make install`, `make zip-file`), has ESLint
  configuration and no automated tests.
- Andrew accepts merge requests on GitLab; his README credits several.

## Design

### Repository and branches

`gelonezi/gnome-wallpaper-rotator` on GitHub **(Roger's name)**
becomes a real fork that keeps Andrew's 147 commits, so his authorship
stays visible and his later updates can be merged.

- A git remote named `upstream` points at his GitLab repository.
- Four feature branches, each starting from upstream's `main` at `73fa1b0`
  and independent of the others:
  `feature/bar-colors`, `feature/keep-image-adjustment`,
  `feature/subfolders`, `feature/panel-indicator`.
- `main` is upstream's `main`, plus the four feature branches merged in,
  plus two commits of our own: the package identity (see "Identity") and
  our files, which are the fork's `README.md` and `docs/`. `main` is what
  the package is built from, what Roger runs, and what a visitor to the
  repository sees.
- The Python tool's single commit is not kept anywhere **(Roger)**. The
  current public `main` is replaced, which needs a forced push.
  **Approving this document approves that forced push**; Claude still
  stops and explains before running it.
- The local folder is `~/git/gnome-wallpaper-rotator` (renamed from
  `~/git/gnome-wallpaper-fit` on 2026-11-20, before the build started).
- This design document, written before the fork exists, is carried over
  onto the new `main`.

Where two feature branches touch the same file (the schema, `prefs.js`,
`extension.js`), the overlaps are resolved in the merges on `main`, never
by making one feature branch depend on another.

### Identity

**On the four feature branches: untouched (Roger).** The name "Wallpaper
Slideshow", the identifier `azwallpaper@azwallpaper.gitlab.com`, the
settings schema, his About and Donate pages and his donation links stay
exactly as they are. These branches are what Andrew is offered.

**In the package: its own identifier and the name "Wallpaper Rotator"
(Roger).** A package for other people cannot carry Andrew's
identifier, for three reasons:

- GNOME Shell checks extensions.gnome.org for updates by identifier. A
  package installed as `azwallpaper@azwallpaper.gitlab.com` would be
  replaced by Andrew's next official release, and the added features
  would vanish.
- Installing it would overwrite the official extension for anyone who
  already has it, and the two could never be installed side by side.
- Its users' bug reports would go to Andrew's issue tracker, for code he
  did not write.

So one commit on `main`, and only there, gives the package the smallest
identity that avoids those problems:

| Item | Value |
|---|---|
| Display name | Wallpaper Rotator |
| Identifier | `gnome-wallpaper-rotator@gelonezi.github.io` |
| Settings schema and path | `org.gnome.shell.extensions.gnome-wallpaper-rotator` |
| Resource path | changed to match, so both extensions can be loaded at once |
| "Report an Issue" and project links | this repository on GitHub |
| Version | restarts at 1 |

Left as they are, to keep that commit small: his gettext domain and
translation files, his logo, his About page text with a line added, "A
fork of Wallpaper Slideshow by Andrew Zaech, with proposed features",
and his Donate page and links, under the heading "Support the original
author". Donations still go to him.

The package is not uploaded to extensions.gnome.org. An unrelated
extension called "Shell Wallpaper Rotator" was waiting in that site's
review queue on 2026-11-20; that is no conflict for a package distributed
from GitHub, but it would be one if this were ever listed there under the
same name.

### Feature 1: bar colours from the image

Branch `feature/bar-colors`. Two new files and small edits.

**`src/barColorMath.js`: pure colour maths.** No Shell or extension
imports, so it runs under plain `gjs` and can be unit tested. Given the
pixels of a small copy of the image, the image size and the screen size, it
returns the shading type and two colours:

1. If the image is narrower in shape than the screen, the bars are at the
   sides: average a strip 2% of the width at the left edge and at the right
   edge, and use a horizontal gradient. Otherwise the bars are above and
   below: average the top and bottom strips, vertical gradient.
2. GNOME's gradient spans the whole screen while the image covers its
   middle. Extend the two colours outward along the same line so the
   gradient equals each edge colour exactly where the image begins and
   ends, clamping each channel to 0–255.

This is the algorithm of the Python tool's `bar_fill` function. The design
reviewer ran both on all 87 of Roger's images at 3440×1440, comparing the
Python result at full resolution with a 256-pixel copy: 7 identical, 79
differing by 1 per channel, 1 by 2. Reference case: a 1920×1080 image whose
left strip averages `#181b0c` and right strip `#2b4830` gives a horizontal
gradient from `#151306` to `#2e5036`.

**`src/barColors.js`: a watcher class** created in `enable()` and
destroyed in `disable()`:

- It acts only while its switch is on **and** GNOME's Image Adjustment is
  "Scaled", the one mode the maths is valid for. In Zoom, Stretched and
  Spanned no background shows; in Centered, None and Wallpaper it shows but
  the geometry differs, and a colour the user chose on purpose must not be
  overwritten.
- It listens to `picture-uri`, `picture-uri-dark`, `picture-options` and
  the interface `color-scheme`, so it reacts to slideshow changes and to
  wallpapers picked by hand alike. It uses the dark URI when the colour
  scheme is dark.
- It loads the image off the main thread, scaled to about 256 pixels on the
  long side, with GdkPixbuf's asynchronous stream loader. A load still
  running when the wallpaper changes again, or at `disable()`, is
  cancelled.
- It uses the primary monitor's size for the screen shape.
- It writes `color-shading-type`, `primary-color` and `secondary-color`,
  only when they differ from the current values.
- Images that cannot be loaded (XML slideshows, SVG, missing files) are
  logged and leave the colours untouched. The logger is passed in, not
  imported from `extension.js`.

**The user's own colours.** When the watcher starts acting (switch on and
mode Scaled, including the first time after install), it saves the three
current values in keys of its own. When it stops acting (switch turned
off, or the mode leaves Scaled), it restores them. Nothing is restored in
`disable()`, which also runs at every screen lock.

**Settings**, in a new group on the existing wallpaper options page:
`slideshow-bar-colors-from-image` (boolean, default off). While the
watcher is acting, his manual colour rows are shown insensitive with a
short note saying why.

### Feature 2: keep the image adjustment

Branch `feature/keep-image-adjustment`. GNOME resets the scaling to Zoom
whenever a wallpaper is picked in Settings or Files; this was Roger's
original complaint.

- `slideshow-keep-image-adjustment` (boolean, default off).
- His "Image Adjustment" row writes GNOME's key directly, so the chosen
  value is also stored in a new key of ours, through a small edit to that
  row. When the switch is on and something else changes `picture-options`,
  the extension writes the stored value back.

### Feature 3: subfolders

Branch `feature/subfolders`. Changes inside `src/slideshow.js`, kept as
small as possible, plus two settings rows:

- `slideshow-include-subfolders` (boolean, default off).
- `slideshow-folder-filter` (string, default empty). When set, only images
  whose containing folder has exactly this name, ignoring case, are used.
  Roger's value is `Trading Cards`.
- With subfolders on, the scan walks the tree and the queue stores paths
  relative to `slideshow-directory` instead of bare names. Everything
  downstream already joins the name to the directory; the builder verifies
  each use ("Show Image in Files", the slide info label, sorting, the
  saved queue, the file monitor's handlers).
- Hidden folders are skipped. Symbolic links to folders are not followed,
  to avoid loops.
- Sorting A–Z and Z–A uses the relative path.
- The file monitor watches every scanned folder, and starts watching
  folders created later.
- The folder-name match is a small pure function, unit tested.

### Feature 4: panel icon **(Roger)**

Branch `feature/panel-indicator`. A `PanelMenu.Button` added with
`Main.panel.addToStatusArea`, the supported route and the one Dash to Panel
honours.

```
 panel:  …  [▣]  …
             │
   ┌─────────┴──────────────┐
   │  Lupo.jpg              │   current image, as in his quick menu
   │  ◀      ⏸      ▶       │   previous · pause/resume · next
   ├────────────────────────┤
   │  Show Image in Files   │
   │  Slideshow Settings    │
   └────────────────────────┘
```

- It reuses his `SlideInfoMenuItem` and `SlideControlsMenuItem` classes,
  which needs a small edit so they can be used by the new code.
- The icon dims while the slideshow is paused.
- `slideshow-show-panel-indicator` (boolean, default off, like every new
  feature here). His quick settings entry and its switch stay as they are.

### Conventions for all four

- New setting keys follow his `slideshow-…` naming.
- Every user-visible string goes through gettext, and the `.pot` template
  is regenerated with his `make potfile`.
- His ESLint configuration passes on every branch.

### Tests

Upstream has none. Each feature branch that has pure logic carries a small
test file under `tests/`, runnable with plain `gjs -m`: the colour maths,
including the reference case above with a tolerance of 2 per channel, and
the folder-name filter. Fixtures are synthetic pixel buffers; Roger's
wallpapers are Steam card art and must not enter the repository.

### Roger's machine

Roger's desktop runs the same package other people get. After it is
installed and working:

1. Remove the Python tool, so two things are not changing the wallpaper:
   disable `wallpaper-rotate.timer` and `wallpaper-fit.service`, then
   delete `~/.local/bin/wallpaper-fit`, `~/.local/bin/wallpaper-rotate`,
   the three `wallpaper-*` unit files in `~/.config/systemd/user/` and the
   `wallpaper-rotate.service.d` folder there.
2. Configure the extension: folder `~/Pictures/wallpapers`, subfolders on,
   filter `Trading Cards`, one hour per slide, random order, Image
   Adjustment "Scaled", keep adjustment on, bar colours on, panel icon on.

## Deliverables

1. The four feature branches and `main`, pushed to GitHub, building with
   `make install`.
2. The unit tests described above.
3. `README.md` on `main`: what this repository is (a fork with proposed
   features), credit to Andrew Zaech with a link to his project first,
   the list of changes with dates, how to install the package, how to
   build from source, and its limits.
4. The package: the zip produced by `make zip-file` on `main`, attached to
   a GitHub Release, installable on any distribution with
   `gnome-extensions install`. Publishing a release is public, so Claude
   asks Roger before each one **(my call on the format: a zip is the one
   package every GNOME distribution can install; a `.deb` would serve
   Debian and Ubuntu only)**.
5. `docs/code-tour.md`: a plain-language walkthrough of every file and
   change we added, written for Roger.
6. `docs/notes-for-andrew.md`: the facts Roger may want when he writes his
   own message: what each branch does, a link to each, what was tested and
   on which GNOME version, and the AI disclosure. Notes only; the message
   is Roger's.

## Left to the builder

- How to exercise the extension on this machine: the development shell if
  it runs, otherwise asking Roger to log out and in.
- Exact widget layout of the new settings rows, following the style of the
  page they join.
- How his ESLint setup is run (`package.json` is present).
- The order in which the feature branches are merged into `main`.

## Later, not part of this work

- If Andrew is interested: merge requests on GitLab, one per feature. That
  needs a GitLab account of Roger's and a fork there.
- Merging Andrew's future releases into the fork.
- A Brazilian Portuguese translation of the new strings.
