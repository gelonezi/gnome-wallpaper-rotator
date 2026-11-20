import {assertEqual, done} from './harness.js';
import {computeBarFill, shouldAct, planSavedColors, uriToLocalPath} from '../src/barColorMath.js';

function makeImage(width, height, paint, nChannels = 3, rowstride = width * nChannels) {
    const pixels = new Uint8Array(rowstride * height);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++)
            pixels.set(paint(x, y), y * rowstride + x * nChannels);
    }
    return {pixels, rowstride, nChannels, width, height};
}

function closeTo(actualHex, expectedHex) {
    for (let i = 1; i < 7; i += 2) {
        const a = parseInt(actualHex.slice(i, i + 2), 16);
        const e = parseInt(expectedHex.slice(i, i + 2), 16);
        if (Math.abs(a - e) > 2)
            return false;
    }
    return true;
}

function paintSides(x) {
    if (x < 4)
        return [0x18, 0x1b, 0x0c];
    if (x >= 188)
        return [0x2b, 0x48, 0x30];
    return [200, 10, 10];
}

// Reference case from the spec: side bars, colours extended outwards.
const sides = makeImage(192, 108, paintSides);
let fill = computeBarFill({...sides, screenWidth: 3440, screenHeight: 1440});
assertEqual(fill.shading, 'horizontal', 'side bars use a horizontal gradient');
assertEqual(closeTo(fill.primary, '#151306'), true, 'left colour extended outwards');
assertEqual(closeTo(fill.secondary, '#2e5036'), true, 'right colour extended outwards');

// 16:9 image on a 16:10 screen (Review Focus 5): bars above and below.
function paintBands(_x, y) {
    if (y < 2)
        return [10, 20, 30];
    if (y >= 106)
        return [40, 50, 60];
    return [0, 0, 0];
}
const bands = makeImage(192, 108, paintBands);
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
const sidesRgbaPadded = makeImage(192, 108, x => [...paintSides(x), 255], 4, 192 * 4 + 8);
const fillRgbaPadded = computeBarFill({...sidesRgbaPadded, screenWidth: 3440, screenHeight: 1440});
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
