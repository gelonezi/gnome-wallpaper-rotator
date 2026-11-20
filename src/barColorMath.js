import GLib from 'gi://GLib';

const EDGE_FRACTION = 0.02;

function meanColor(image, x0, x1, y0, y1) {
    const {pixels, rowstride, nChannels} = image;
    const sum = [0, 0, 0];
    for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
            const i = y * rowstride + x * nChannels;
            sum[0] += pixels[i];
            sum[1] += pixels[i + 1];
            sum[2] += pixels[i + 2];
        }
    }
    const count = (x1 - x0) * (y1 - y0);
    return sum.map(s => s / count);
}

function toHex(color) {
    return `#${color.map(c => {
        const v = Math.min(255, Math.max(0, Math.round(c)));
        return v.toString(16).padStart(2, '0');
    }).join('')}`;
}

/**
 * Works out a gradient that continues a scaled wallpaper's edges into the bars around it.
 *
 * @param {object} image pixel data laid out as GdkPixbuf does, plus the screen size
 * @returns {{shading: string, primary: string, secondary: string}}
 */
export function computeBarFill(image) {
    const {width, height, screenWidth, screenHeight} = image;
    const sideBars = width / height <= screenWidth / screenHeight;
    let first, second, shown, total, shading;
    if (sideBars) {
        const strip = Math.max(1, Math.round(width * EDGE_FRACTION));
        first = meanColor(image, 0, strip, 0, height);
        second = meanColor(image, width - strip, width, 0, height);
        shown = width * screenHeight / height;
        total = screenWidth;
        shading = 'horizontal';
    } else {
        const strip = Math.max(1, Math.round(height * EDGE_FRACTION));
        first = meanColor(image, 0, width, 0, strip);
        second = meanColor(image, 0, width, height - strip, height);
        shown = height * screenWidth / width;
        total = screenHeight;
        shading = 'vertical';
    }

    let primary = first;
    let secondary = second;
    // Extend the edge gradient linearly so it reaches the screen edges.
    if (shown > 0 && shown < total) {
        const start = (total - shown) / 2 / total;
        const span = shown / total;
        const slope = first.map((f, c) => (second[c] - f) / span);
        primary = first.map((f, c) => f - start * slope[c]);
        secondary = first.map((f, c) => f + (1 - start) * slope[c]);
    }

    return {shading, primary: toHex(primary), secondary: toHex(secondary)};
}

/**
 * @param {boolean} enabled
 * @param {string} pictureOptions
 * @returns {boolean}
 */
export function shouldAct(enabled, pictureOptions) {
    return enabled && pictureOptions === 'scaled';
}

/**
 * Decides whether to save the user's colours or restore them, never overwriting an earlier save.
 *
 * @param {boolean} acting
 * @param {string[]} saved
 * @param {string[]} current
 * @returns {{save: string[]|null, restore: string[]|null}}
 */
export function planSavedColors(acting, saved, current) {
    if (acting)
        return {save: saved.length === 0 ? current : null, restore: null};
    return {save: null, restore: saved.length > 0 ? saved : null};
}

/**
 * @param {string} uri
 * @returns {string|null}
 */
export function uriToLocalPath(uri) {
    try {
        const [path] = GLib.filename_from_uri(uri);
        return path;
    } catch {
        return null;
    }
}
