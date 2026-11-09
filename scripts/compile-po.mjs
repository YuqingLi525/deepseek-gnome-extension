#!/usr/bin/env node

import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname} from 'node:path';

const [, , inputPath, outputPath] = process.argv;

if (!inputPath || !outputPath) {
    console.error('Usage: compile-po.mjs INPUT.po OUTPUT.mo');
    process.exit(2);
}

function decodePoString(text) {
    return JSON.parse(text);
}

function parsePo(source) {
    const entries = [];
    let entry = null;
    let activeField = null;

    const finishEntry = () => {
        if (entry && entry.msgid !== null && entry.msgstr !== null && !entry.fuzzy)
            entries.push([entry.msgid, entry.msgstr]);
        entry = null;
        activeField = null;
    };

    for (const rawLine of source.split(/\r?\n/)) {
        const line = rawLine.trim();

        if (line === '') {
            finishEntry();
            continue;
        }

        if (!entry)
            entry = {msgid: null, msgstr: null, fuzzy: false};

        if (line.startsWith('#,')) {
            entry.fuzzy ||= line.includes('fuzzy');
        } else if (line.startsWith('#')) {
            continue;
        } else if (line.startsWith('msgid ')) {
            activeField = 'msgid';
            entry.msgid = decodePoString(line.slice(6));
        } else if (line.startsWith('msgstr ')) {
            activeField = 'msgstr';
            entry.msgstr = decodePoString(line.slice(7));
        } else if (line.startsWith('"') && activeField) {
            entry[activeField] += decodePoString(line);
        }
    }

    finishEntry();
    return entries;
}

function compileMo(entries) {
    const sorted = entries
        .map(([id, value]) => [Buffer.from(id), Buffer.from(value)])
        .sort(([left], [right]) => Buffer.compare(left, right));
    const count = sorted.length;
    const originalsOffset = 28;
    const translationsOffset = originalsOffset + count * 8;
    let dataOffset = translationsOffset + count * 8;

    const originalTable = [];
    const translationTable = [];
    const dataParts = [];

    for (const [original] of sorted) {
        originalTable.push([original.length, dataOffset]);
        dataParts.push(original, Buffer.from([0]));
        dataOffset += original.length + 1;
    }

    for (const [, translation] of sorted) {
        translationTable.push([translation.length, dataOffset]);
        dataParts.push(translation, Buffer.from([0]));
        dataOffset += translation.length + 1;
    }

    const header = Buffer.alloc(translationsOffset + count * 8);
    header.writeUInt32LE(0x950412de, 0);
    header.writeUInt32LE(0, 4);
    header.writeUInt32LE(count, 8);
    header.writeUInt32LE(originalsOffset, 12);
    header.writeUInt32LE(translationsOffset, 16);
    header.writeUInt32LE(0, 20);
    header.writeUInt32LE(0, 24);

    originalTable.forEach(([length, offset], index) => {
        header.writeUInt32LE(length, originalsOffset + index * 8);
        header.writeUInt32LE(offset, originalsOffset + index * 8 + 4);
    });
    translationTable.forEach(([length, offset], index) => {
        header.writeUInt32LE(length, translationsOffset + index * 8);
        header.writeUInt32LE(offset, translationsOffset + index * 8 + 4);
    });

    return Buffer.concat([header, ...dataParts]);
}

const entries = parsePo(readFileSync(inputPath, 'utf8'));
mkdirSync(dirname(outputPath), {recursive: true});
writeFileSync(outputPath, compileMo(entries));
console.log(`Compiled ${entries.length} translations to ${outputPath}`);
