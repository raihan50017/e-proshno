const BN_ZERO = 0x09e6 // Bengali digit zero
const BN_NINE = 0x09ef // Bengali digit nine

export const toBnDigits = (v: string | number) =>
  String(v).replace(/[0-9]/g, (d) => String.fromCharCode(BN_ZERO + Number(d)))

export const toEnDigits = (s: string) =>
  Array.from(s, (ch) => {
    const code = ch.charCodeAt(0)
    return code >= BN_ZERO && code <= BN_NINE ? String(code - BN_ZERO) : ch
  }).join('')

// Indian grouping + Bangla digits: 1234567 → ১২,৩৪,৫৬৭
export const formatBn = (n: number) => new Intl.NumberFormat('bn-BD').format(n)

// 3022000 → "৩০.২২ লাখ", 869100000 → "৮৬.৯১ কোটি"
export function compactBn(n: number) {
  if (n >= 1e7) return `${toBnDigits((n / 1e7).toFixed(2))} কোটি`
  if (n >= 1e5) return `${toBnDigits((n / 1e5).toFixed(2))} লাখ`
  return formatBn(n)
}

// Convert poisha to Taka formatted string (e.g. 10000 poisha -> "১০০ ৳")
export function toTaka(poisha: number | bigint) {
  const taka = Number(poisha) / 100
  return `${formatBn(taka)} ৳`
}

export const OPTION_LABELS = ['ক', 'খ', 'গ', 'ঘ'] as const

export const formatDateBn = (d: Date | string) =>
  new Intl.DateTimeFormat('bn-BD', { dateStyle: 'long', timeZone: 'Asia/Dhaka' }).format(new Date(d))

export const relativeBn = new Intl.RelativeTimeFormat('bn', { numeric: 'auto' })

