import {assertEqual, done} from './harness.js';
import {adjustmentToRestore} from '../src/imageAdjustment.js';

assertEqual(adjustmentToRestore(true, 'scaled', 'zoom'), 'scaled', 'GNOME reset to Zoom is undone');
assertEqual(adjustmentToRestore(true, 'scaled', 'scaled'), null, 'nothing to do when already right');
assertEqual(adjustmentToRestore(false, 'scaled', 'zoom'), null, 'off means hands off');
assertEqual(adjustmentToRestore(true, '', 'zoom'), null, 'no stored choice, nothing to restore');
done();
