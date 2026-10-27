import assert from "node:assert/strict"
import { test } from "node:test"
import type Anthropic from "@anthropic-ai/sdk"
import { createAnswer, encodeEvent, readEvents, REFUSAL, toHistory, type ChatEvent } from "./chat.ts"

const sources = [
  { id: "a", title: "Bienen.pdf" },
  { id: "b", title: "Notizen" },
]

const text = (t: string) =>
  ({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: t } }) as Anthropic.RawMessageStreamEvent
const cite = (document_index: number, page?: number) =>
  ({
    type: "content_block_delta",
    index: 0,
    delta: {
      type: "citations_delta",
      citation: page
        ? { type: "page_location", document_index, cited_text: "zitat", start_page_number: page, end_page_number: page + 1 }
        : { type: "char_location", document_index, cited_text: "zitat", start_char_index: 0, end_char_index: 5 },
    },
  }) as Anthropic.RawMessageStreamEvent
const stop = { type: "content_block_stop", index: 0 } as Anthropic.RawMessageStreamEvent

test("anchors citations at the end of their text block", () => {
  const answer = createAnswer(sources)
  const events = [cite(0, 3), text("Sechs "), text("Wochen."), stop, cite(1), text(" Mehr."), stop].flatMap((e) => answer.push(e))

  assert.equal(answer.content, "Sechs Wochen. Mehr.")
  assert.deepEqual(
    answer.citations.map((c) => [c.source_id, c.page, c.at]),
    [
      ["a", 3, 13],
      ["b", null, 19],
    ]
  )
  assert.deepEqual(
    events.map((e) => e.type),
    ["text", "text", "citation", "text", "citation"]
  )
})

test("ignores citations that point to unknown documents", () => {
  const answer = createAnswer(sources)
  ;[cite(7), text("x"), stop].forEach((e) => answer.push(e))
  assert.equal(answer.citations.length, 0)
})

test("refusal replaces content and drops citations", () => {
  const answer = createAnswer(sources)
  ;[cite(0), text("x"), stop].forEach((e) => answer.push(e))
  assert.deepEqual(answer.refuse(), { type: "replace", text: REFUSAL })
  assert.equal(answer.content, REFUSAL)
  assert.equal(answer.citations.length, 0)
})

test("history is chronological, starts with the user and skips empty turns", () => {
  const history = toHistory([
    { role: "assistant", content: "A2" },
    { role: "user", content: "U2" },
    { role: "assistant", content: " " },
    { role: "user", content: "U1" },
    { role: "assistant", content: "A0" },
  ])
  assert.deepEqual(
    history.map((m) => m.content),
    ["U1", "U2", "A2"]
  )
})

test("history keeps only the newest turns that fit the character budget", () => {
  const history = toHistory(
    [
      { role: "assistant", content: "A2" },
      { role: "user", content: "U2" },
      { role: "assistant", content: "A1 mit einer sehr langen Antwort" },
      { role: "user", content: "U1" },
    ],
    4
  )
  assert.deepEqual(
    history.map((m) => m.content),
    ["U2", "A2"]
  )
})

test("history shortens the turn that crosses the budget instead of losing the latest exchange", () => {
  const history = toHistory(
    [
      { role: "assistant", content: "Antwort" },
      { role: "user", content: "langer Text … Frage?" },
      { role: "assistant", content: "A1" },
    ],
    13
  )
  assert.deepEqual(
    history.map((m) => m.content),
    ["Frage?", "Antwort"]
  )
})

test("history never leaves half an emoji when it shortens a turn", () => {
  const history = toHistory([{ role: "user", content: "Was fressen Bienen 🐝?" }], 2)
  assert.deepEqual(
    history.map((m) => m.content),
    ["�?"]
  )
})

test("reads events split across arbitrary chunk boundaries", async () => {
  const sent: ChatEvent[] = [{ type: "text", text: "Hallo „Welt“ 🐝" }, { type: "done" }]
  const bytes = new TextEncoder().encode(sent.map(encodeEvent).join(""))
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let i = 0; i < bytes.length; i += 3) controller.enqueue(bytes.slice(i, i + 3))
      controller.close()
    },
  })
  const received: ChatEvent[] = []
  for await (const event of readEvents(body)) received.push(event)
  assert.deepEqual(received, sent)
})
