import { Address } from '@ton/ton'

// 1 GRAM = 1_000_000_000 nanogram, same scaling as toncoin nano units.
export function formatGram(nano: bigint): string {
    const negative = nano < 0n
    const abs = negative ? -nano : nano
    const whole = abs / 1_000_000_000n
    const frac = (abs % 1_000_000_000n).toString().padStart(9, '0').replace(/0+$/, '')
    return (negative ? '-' : '') + whole.toString() + (frac === '' ? '' : '.' + frac)
}

// Parse a decimal GRAM amount like '300000' or '1.5' into nanogram.
export function parseGram(value: string): bigint {
    const match = /^(\d+)(?:\.(\d{1,9}))?$/.exec(value.trim())
    if (match == null) {
        throw new Error(`invalid GRAM amount '${value}': expected a decimal number with up to 9 fraction digits`)
    }
    const whole = BigInt(match[1])
    const frac = BigInt((match[2] ?? '').padEnd(9, '0'))
    return whole * 1_000_000_000n + frac
}

export function parseAddress(value: string, label: string): Address {
    try {
        return Address.parse(value.trim())
    } catch {
        throw new Error(`invalid ${label} '${value}': expected a TON address in raw or user-friendly form`)
    }
}

export function formatTime(unixSeconds: bigint | number): string {
    return new Date(Number(unixSeconds) * 1000).toISOString()
}

export function formatPercent(fraction: number): string {
    return (fraction * 100).toFixed(2) + '%'
}
