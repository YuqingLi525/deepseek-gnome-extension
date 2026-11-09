import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('registers the indicator with the GNOME top panel', async () => {
    const source = await readFile(new URL('../extension.js', import.meta.url), 'utf8');

    assert.match(
        source,
        /Main\.panel\.addToStatusArea\(this\.uuid, this\._indicator\)/
    );
});
