import assert from "node:assert/strict"
import { test } from "node:test"
import { withCitationMarkers } from "./citations.ts"

const cite = (at: number) => ({ source_id: "s", source_title: "S", cited_text: "x", page: null, at })

test("inserts markers at offsets in order", () => {
  assert.equal(withCitationMarkers("Eins. Zwei.", [cite(11), cite(5)]), "Eins.[2](#cite-1) Zwei.[1](#cite-0)")
})

test("clamps offsets beyond the text", () => {
  assert.equal(withCitationMarkers("Hi", [cite(9)]), "Hi[1](#cite-0)")
})
