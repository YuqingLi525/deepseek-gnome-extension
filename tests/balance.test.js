import test from 'node:test';
import assert from 'node:assert/strict';

import {formatMoney, parseBalancePayload, updateUsageEstimate} from '../balance.js';

test('parses the preferred currency', () => {
    const balance = parseBalancePayload({
        is_available: true,
        balance_infos: [
            {
                currency: 'USD',
                total_balance: '5.50',
                granted_balance: '0.50',
                topped_up_balance: '5.00',
            },
            {
                currency: 'CNY',
                total_balance: '110.00',
                granted_balance: '10.00',
                topped_up_balance: '100.00',
            },
        ],
    }, 'CNY');

    assert.deepEqual(balance, {
        available: true,
        currency: 'CNY',
        total: 110,
        granted: 10,
        toppedUp: 100,
    });
});

test('rejects malformed amounts', () => {
    assert.throws(() => parseBalancePayload({
        is_available: true,
        balance_infos: [{
            currency: 'CNY',
            total_balance: 'not-a-number',
            granted_balance: '0',
            topped_up_balance: '0',
        }],
    }), /Invalid total_balance/);
});

test('formats known and unknown currencies', () => {
    assert.equal(formatMoney(12.5, 'CNY'), '¥12.50');
    assert.equal(formatMoney(12.5, 'USD'), '$12.50');
    assert.equal(formatMoney(12.5, 'EUR'), 'EUR 12.50');
});

test('tracks only observed balance decreases', () => {
    const initial = updateUsageEstimate(null, {currency: 'CNY', total: 100}, '2026-11-09');
    const spent = updateUsageEstimate(initial, {currency: 'CNY', total: 97.5}, '2026-11-09');
    const topUp = updateUsageEstimate(spent, {currency: 'CNY', total: 107.5}, '2026-11-09');
    const spentAgain = updateUsageEstimate(topUp, {currency: 'CNY', total: 106.5}, '2026-11-09');

    assert.equal(spent.spent, 2.5);
    assert.equal(topUp.spent, 2.5);
    assert.equal(spentAgain.spent, 3.5);
});

test('resets the estimate on a new local day', () => {
    const previous = {
        date: '2026-11-08',
        currency: 'CNY',
        lastBalance: 90,
        spent: 10,
    };
    const next = updateUsageEstimate(previous, {currency: 'CNY', total: 89}, '2026-11-09');

    assert.equal(next.spent, 0);
    assert.equal(next.lastBalance, 89);
});
