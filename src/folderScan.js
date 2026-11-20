import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

Gio._promisify(Gio.File.prototype, 'enumerate_children_async', 'enumerate_children_finish');
Gio._promisify(Gio.FileEnumerator.prototype, 'next_files_async', 'next_files_finish');

/**
 * Checks whether the folder directly containing a file has the given name.
 *
 * @param {string} relativePath the file path relative to the slideshow directory
 * @param {string} filter the folder name to match, ignoring case; empty matches every file
 * @returns {boolean} whether the file passes the filter
 */
export function matchesFolderFilter(relativePath, filter) {
    if (!filter)
        return true;

    const parts = relativePath.split('/');
    if (parts.length < 2)
        return false;

    return parts[parts.length - 2].toLowerCase() === filter.toLowerCase();
}

async function listFolder(dir) {
    const fileEnum = await dir.enumerate_children_async(
        'standard::name,standard::type,standard::content-type,standard::is-hidden,standard::is-symlink,time::created',
        Gio.FileQueryInfoFlags.NONE,
        GLib.PRIORITY_DEFAULT, null);

    const fileInfos = [];
    let infos;
    do {
        // eslint-disable-next-line no-await-in-loop
        infos = await fileEnum.next_files_async(100, GLib.PRIORITY_DEFAULT, null);
        fileInfos.push(...infos);
    } while (infos.length > 0);
    fileEnum.close(null);

    return fileInfos;
}

/**
 * Lists the images in a slideshow directory, and optionally in its subfolders.
 * Hidden folders, symbolic links to folders and folders that cannot be read are skipped.
 *
 * @param {string} rootPath the slideshow directory
 * @param {object} options scan options
 * @param {boolean} options.includeSubfolders whether to scan subfolders
 * @param {string} options.folderFilter only keep images whose folder has this name (subfolders only)
 * @returns {Promise<{images: Array<{name: string, date: string}>, folders: string[]}>}
 * images with paths relative to rootPath, and the absolute path of every folder scanned, root first
 */
export async function scanImages(rootPath, {includeSubfolders, folderFilter}) {
    const root = Gio.file_new_for_path(rootPath);
    const filter = includeSubfolders ? folderFilter : '';
    const images = [];
    const folders = [rootPath];
    const pending = [root];

    while (pending.length > 0) {
        const dir = pending.shift();

        let fileInfos;
        try {
            // eslint-disable-next-line no-await-in-loop
            fileInfos = await listFolder(dir);
        } catch (e) {
            // An unreadable subfolder is skipped quietly; only report the root, as before.
            if (dir === root)
                console.log(e);
            continue;
        }

        if (dir !== root)
            folders.push(dir.get_path());

        for (const info of fileInfos) {
            const child = dir.get_child(info.get_name());

            if (info.get_file_type() === Gio.FileType.DIRECTORY) {
                if (includeSubfolders && !info.get_is_hidden() && !info.get_is_symlink())
                    pending.push(child);
                continue;
            }

            const name = root.get_relative_path(child);
            const contentType = info.get_content_type();
            const date = info.get_attribute_uint64('time::created').toString();
            if (contentType.startsWith('image/') && matchesFolderFilter(name, filter))
                images.push({name, date});
        }
    }

    return {images, folders};
}
