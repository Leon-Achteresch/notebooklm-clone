import assert from "node:assert/strict"
import { test } from "node:test"
import { csvName, filterRows, isNumericColumn, normalizeRows, parseNumber, sortRows, toDelimited } from "./table.ts"

test("pads and truncates ragged rows to the column count", () => {
  assert.deepEqual(normalizeRows([["a"], ["a", "b", "c", "d"], []], 3), [
    ["a", "", ""],
    ["a", "b", "c"],
    ["", "", ""],
  ])
})

test("parses German numbers with qualifiers, units and ranges", () => {
  const cases: [string, number][] = [
    ["1.234,5", 1234.5],
    ["80 %", 80],
    ["ca. 20.000", 20000],
    ["1.234.567,89", 1234567.89],
    ["0,25", 0.25],
    ["3.5", 3.5],
    ["12.500", 12500],
    ["−2,5", -2.5],
    ["–4 °C", -4],
    ["+12 %", 12],
    ["€ 4,50", 4.5],
    ["1.200,50 €", 1200.5],
    ["bis zu 60.000 Bienen", 60000],
    ["20.000–60.000", 20000],
    ["3–5 Jahre", 3],
    ["Über 2 Mio.", 2],
    ["2024", 2024],
  ]
  for (const [input, expected] of cases) assert.equal(parseNumber(input), expected, input)
})

test("rejects text, dates and ambiguous values", () => {
  for (const input of ["", "k. A.", "Apis mellifera", "Juli 2024", "12.05.2024", "2024-05-12", "10:30", "1/3", "- 5"]) {
    assert.equal(parseNumber(input), null, input)
  }
})

test("detects mostly numeric columns and ignores blanks", () => {
  assert.equal(isNumericColumn(["1.200", "80 %", "", "–", "ca. 3", "k. A."]), true)
  assert.equal(isNumericColumn(["Königin", "Drohne", "3 Tage"]), false)
  assert.equal(isNumericColumn(["", "—"]), false)
})

test("sorts numeric columns by value and keeps blanks last in both directions", () => {
  const rows = [["1.200"], [""], ["80"], ["k. A."], ["ca. 20.000"], ["3,5"]]
  assert.deepEqual(sortRows(rows, 0, "asc", true).flat(), ["3,5", "80", "1.200", "ca. 20.000", "k. A.", ""])
  assert.deepEqual(sortRows(rows, 0, "desc", true).flat(), ["ca. 20.000", "1.200", "80", "3,5", "k. A.", ""])
})

test("sorts text columns naturally with the German collator", () => {
  const rows = [["Volk 10"], ["Zeidler"], ["ähnlich"], [""], ["Volk 2"], ["Apfel"]]
  assert.deepEqual(sortRows(rows, 0, "asc", false).flat(), ["ähnlich", "Apfel", "Volk 2", "Volk 10", "Zeidler", ""])
  assert.deepEqual(sortRows(rows, 0, "desc", false).flat(), ["Zeidler", "Volk 10", "Volk 2", "Apfel", "ähnlich", ""])
})

test("keeps the original order for equal values", () => {
  const rows = [["5", "a"], ["5", "b"], ["1", "c"]]
  assert.deepEqual(sortRows(rows, 0, "desc", true).map((row) => row[1]), ["a", "b", "c"])
})

test("filters rows by every term across cells, case-insensitively", () => {
  const rows = [
    ["Königin", "legt Eier"],
    ["Drohne", "begattet die Königin"],
    ["Arbeiterin", "sammelt Nektar"],
  ]
  assert.deepEqual(filterRows(rows, "  KÖNIGIN "), rows.slice(0, 2))
  assert.deepEqual(filterRows(rows, "drohne königin"), [rows[1]])
  assert.deepEqual(filterRows(rows, "in legt"), [rows[0]])
  assert.deepEqual(filterRows(rows, "nektarkönigin"), [])
  assert.equal(filterRows(rows, " "), rows)
})

test("quotes separators, quotes and line breaks", () => {
  const rows = [
    ["Name", "Notiz"],
    ["Apis; mellifera", 'Sie sagte "summ"'],
    ["Zeile\nzwei", "ok"],
  ]
  assert.equal(toDelimited(rows, ";"), 'Name;Notiz\r\n"Apis; mellifera";"Sie sagte ""summ"""\r\n"Zeile\nzwei";ok')
  assert.equal(toDelimited([["a\tb", "Apis; mellifera"]], "\t"), '"a\tb"\tApis; mellifera')
})

test("neutralises spreadsheet formulas but keeps signed numbers", () => {
  assert.equal(toDelimited([["=HYPERLINK(1)", "-2,5", "+12 %", "-", "@SUM(A1)"]], ";"), "'=HYPERLINK(1);-2,5;+12 %;-;'@SUM(A1)")
  assert.equal(toDelimited([["-1+cmd|'/C calc'!A0", "+3 Bienen", "-1.234,5"]], ";"), "'-1+cmd|'/C calc'!A0;'+3 Bienen;-1.234,5")
})

test("derives a safe file name from the title", () => {
  assert.equal(csvName("Honigbienen: Völker & Erträge 2024"), "honigbienen-völker-erträge-2024.csv")
  assert.equal(csvName(" / "), "tabelle.csv")
})
