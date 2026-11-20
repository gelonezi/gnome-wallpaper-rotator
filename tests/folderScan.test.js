import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {assertEqual, done} from './harness.js';
import {matchesFolderFilter, scanImages} from '../src/folderScan.js';

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * Writes a file, creating its parent folders.
 *
 * @param {string} path the file to write
 * @param {Uint8Array} bytes the file content
 */
function writeFile(path, bytes) {
    GLib.mkdir_with_parents(GLib.path_get_dirname(path), 0o755);
    GLib.file_set_contents(path, bytes);
}

/**
 * Deletes a tree without following symbolic links.
 *
 * @param {Gio.File} file the file or folder to delete
 */
function deleteTree(file) {
    const type = file.query_file_type(Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, null);
    if (type === Gio.FileType.DIRECTORY) {
        const fileEnum = file.enumerate_children('standard::name', Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, null);
        let info;
        while ((info = fileEnum.next_file(null)))
            deleteTree(file.get_child(info.get_name()));
        fileEnum.close(null);
    }
    file.delete(null);
}

const names = r => r.images.map(i => i.name).sort();

const root = GLib.dir_make_tmp('wsct-XXXXXX');
const png = new Uint8Array([...PNG_SIGNATURE, 1, 2, 3]);
writeFile(`${root}/a.png`, png);
writeFile(`${root}/notes.txt`, new TextEncoder().encode('not an image'));
writeFile(`${root}/.hidden/h.png`, png);
writeFile(`${root}/Game One/Trading Cards/c1.png`, png);
writeFile(`${root}/Game One/Backgrounds/b1.png`, png);
writeFile(`${root}/Game Two/trading cards/c2.png`, png);
Gio.File.new_for_path(`${root}/loop`).make_symbolic_link(root, null);
writeFile(`${root}/locked/x.png`, png);
GLib.chmod(`${root}/locked`, 0o000);

try {
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

    const seen = [];
    r = await scanImages(root, {includeSubfolders: true, folderFilter: 'Trading Cards', onFolder: path => seen.push(path)});
    assertEqual(names(r), ['Game One/Trading Cards/c1.png', 'Game Two/trading cards/c2.png'], 'filter keeps matching folders only');
    assertEqual(r.folders[0], root, 'root is listed first');
    assertEqual(r.folders.includes(`${root}/Game One/Trading Cards`), true, 'scanned folders are reported');
    assertEqual(seen[0], root, 'onFolder sees the root first');
    assertEqual(seen.slice(1).sort(), ['Game One', 'Game One/Backgrounds', 'Game One/Trading Cards', 'Game Two', 'Game Two/trading cards', 'locked'].map(f => `${root}/${f}`),
        'onFolder sees every folder it tries to read, unreadable ones included');

    const seenFromSub = [];
    r = await scanImages(root, {includeSubfolders: true, folderFilter: '', startPath: `${root}/Game One`, onFolder: path => seenFromSub.push(path)});
    assertEqual(names(r), ['Game One/Backgrounds/b1.png', 'Game One/Trading Cards/c1.png'], 'scan from a subfolder keeps names relative to the root');
    assertEqual(seenFromSub.sort(), ['Game One', 'Game One/Backgrounds', 'Game One/Trading Cards'].map(f => `${root}/${f}`),
        'scan from a subfolder reads only that subtree');

    r = await scanImages(root, {includeSubfolders: true, folderFilter: 'Trading Cards', startPath: `${root}/Game One/Trading Cards`});
    assertEqual(names(r), ['Game One/Trading Cards/c1.png'], 'filter applies to images directly in the start folder');
} finally {
    GLib.chmod(`${root}/locked`, 0o755);
    deleteTree(Gio.File.new_for_path(root));
}
done();
