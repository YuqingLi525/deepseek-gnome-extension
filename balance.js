const CURRENCY_SYMBOLS = {
    CNY: '¥',
    USD: '$',
};

function parseAmount(value, fieldName) {
    const amount = Number(value);

    if (!Number.isFinite(amount) || amount < 0)
        throw new Error(`Invalid ${fieldName}`);

    return amount;
}

export function parseBalancePayload(payload, preferredCurrency = 'CNY') {
    if (!payload || !Array.isArray(payload.balance_infos) || payload.balance_infos.length === 0)
        throw new Error('Balance information is missing');

    const info = payload.balance_infos.find(item => item.currency === preferredCurrency)
        ?? payload.balance_infos[0];

    if (!info || typeof info.currency !== 'string')
        throw new Error('Currency is missing');

    return {
        available: payload.is_available === true,
        currency: info.currency,
        total: parseAmount(info.total_balance, 'total_balance'),
        granted: parseAmount(info.granted_balance, 'granted_balance'),
        toppedUp: parseAmount(info.topped_up_balance, 'topped_up_balance'),
    };
}

export function formatMoney(amount, currency) {
    const symbol = CURRENCY_SYMBOLS[currency] ?? `${currency} `;
    return `${symbol}${amount.toFixed(2)}`;
}

export function updateUsageEstimate(previous, balance, localDate) {
    const isNewPeriod = !previous
        || previous.date !== localDate
        || previous.currency !== balance.currency;

    if (isNewPeriod) {
        return {
            date: localDate,
            currency: balance.currency,
            lastBalance: balance.total,
            spent: 0,
        };
    }

    const decrease = Math.max(0, previous.lastBalance - balance.total);

    return {
        ...previous,
        lastBalance: balance.total,
        spent: previous.spent + decrease,
    };
}
