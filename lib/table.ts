export type SortDirection = "asc" | "desc"

const NUMBER =
  /^(?:ca\.?|circa|etwa|rund|knapp|ungefähr|über|unter|bis zu|mehr als|weniger als|max\.?|min\.?|[~≈<>≤≥Ø])?\s*[€$£]?\s*([+\-−–]?)(\d{1,3}(?:\.\d{3})+|\d+)(?:[.,](\d+))?(?:\s*[–—-]\s*[\d.,]+)?(?:\s*[^\d\s][^\d]{0,19})?$/i

const collator = new Intl.Collator("de", { numeric: true, sensitivity: "base" })

const isBlank = (value: string) => /^[\s\-–—]*$/.test(value)

export function normalizeRows(rows: string[][], width: number) {
  return rows.map((row) => Array.from({ length: width }, (_, i) => row[i] ?? ""))
}

export function parseNumber(value: string) {
  const match = NUMBER.exec(value.trim())
  if (!match) return null
  const [, sign, int, fraction = "0"] = match
  const number = Number(`${int.replaceAll(".", "")}.${fraction}`)
  return sign && sign !== "+" ? -number : number
}

export function isNumericColumn(values: string[]) {
  const filled = values.filter((value) => !isBlank(value))
  return filled.length > 0 && filled.filter((value) => parseNumber(value) !== null).length / filled.length >= 0.7
}

export function filterRows(rows: string[][], query: string) {
  const terms = query.toLocaleLowerCase("de").split(/\s+/).filter(Boolean)
  if (!terms.length) return rows
  return rows.filter((row) => {
    const text = row.join("\n").toLocaleLowerCase("de")
    return terms.every((term) => text.includes(term))
  })
}

export function sortRows(rows: string[][], column: number, direction: SortDirection, numeric: boolean) {
  const sign = direction === "asc" ? 1 : -1
  const keyed = rows.map((row) => {
    const text = row[column] ?? ""
    const number = numeric ? parseNumber(text) : null
    return { row, text, number, rank: isBlank(text) ? 2 : numeric && number === null ? 1 : 0 }
  })
  keyed.sort(
    (a, b) =>
      a.rank - b.rank ||
      sign * (a.number !== null && b.number !== null ? a.number - b.number : collator.compare(a.text, b.text))
  )
  return keyed.map(({ row }) => row)
}

function cell(value: string, separator: string) {
  const safe = /^[=+\-@\t\r][\s\S]/.test(value) && !/^[+-]\d[\d.,]*\s?%?$/.test(value) ? `'${value}` : value
  return safe.includes(separator) || /["\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe
}

export function toDelimited(rows: string[][], separator: ";" | "\t") {
  return rows.map((row) => row.map((value) => cell(value, separator)).join(separator)).join("\r\n")
}

export function csvName(title: string) {
  const base = title
    .toLocaleLowerCase("de")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .slice(0, 80)
    .replace(/^-+|-+$/g, "")
  return `${base || "tabelle"}.csv`
}
