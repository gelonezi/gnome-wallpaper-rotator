import System from 'system';

let failures = 0;

/**
 * Prints `ok` when the two values serialise to the same JSON, otherwise
 * prints both and records a failure.
 *
 * @param {*} actual the value produced by the code under test
 * @param {*} expected the value the test expects
 * @param {string} label a short description of the check
 */
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

/**
 * Exits with status 1 if any check failed.
 */
export function done() {
    if (failures > 0)
        System.exit(1);
    print('all tests passed');
}
