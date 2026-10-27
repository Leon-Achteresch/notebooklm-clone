import type Anthropic from "@anthropic-ai/sdk"
import type { Citation, Message, Source } from "@/lib/types"

export type ChatEvent =
  | { type: "text"; text: string }
  | { type: "citation"; citation: Citation }
  | { type: "replace"; text: string }
  | { type: "done" }
  | { type: "error"; error: string }

export const REFUSAL = "Diese Anfrage kann leider nicht beantwortet werden."

export function createAnswer(sources: Pick<Source, "id" | "title">[]) {
  let content = ""
  let citations: Citation[] = []
  let pending: Citation[] = []

  return {
    get content() {
      return content
    },
    get citations() {
      return citations
    },
    push(event: Anthropic.RawMessageStreamEvent): ChatEvent[] {
      if (event.type === "content_block_stop") {
        const flushed = pending.map((c) => ({ ...c, at: content.length }))
        pending = []
        citations = [...citations, ...flushed]
        return flushed.map((citation) => ({ type: "citation", citation }))
      }
      if (event.type !== "content_block_delta") return []
      if (event.delta.type === "text_delta") {
        content += event.delta.text
        return [{ type: "text", text: event.delta.text }]
      }
      if (event.delta.type === "citations_delta") {
        const c = event.delta.citation
        const source = "document_index" in c ? sources[c.document_index] : undefined
        if (source)
          pending.push({
            source_id: source.id,
            source_title: source.title,
            cited_text: c.cited_text,
            page: c.type === "page_location" ? c.start_page_number : null,
            at: 0,
          })
      }
      return []
    },
    refuse(): ChatEvent {
      content = REFUSAL
      citations = []
      pending = []
      return { type: "replace", text: content }
    },
  }
}

export function toHistory(newestFirst: Pick<Message, "role" | "content">[], budget = 40_000): Anthropic.MessageParam[] {
  const turns: Pick<Message, "role" | "content">[] = []
  let left = budget
  for (const m of newestFirst) {
    if (!m.content.trim()) continue
    if (left <= 0) break
    turns.unshift(m.content.length > left ? { ...m, content: m.content.slice(-left).toWellFormed() } : m)
    left -= m.content.length
  }
  while (turns[0]?.role === "assistant") turns.shift()
  return turns.map((m) => ({ role: m.role, content: m.content }))
}

export function encodeEvent(event: ChatEvent) {
  return JSON.stringify(event) + "\n"
}

export async function* readEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<ChatEvent> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  for (;;) {
    const { value, done } = await reader.read()
    buffer += decoder.decode(value, { stream: !done })
    if (done) break
    const lines = buffer.split("\n")
    buffer = lines.pop() ?? ""
    for (const line of lines) if (line.trim()) yield JSON.parse(line) as ChatEvent
  }
  if (buffer.trim()) yield JSON.parse(buffer) as ChatEvent
}
