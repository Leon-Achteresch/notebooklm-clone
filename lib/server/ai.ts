import "server-only"
import Anthropic from "@anthropic-ai/sdk"
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod"
import { z } from "zod"
import { must, UserError } from "@/lib/server/action"
import type { Db } from "@/lib/supabase/server"
import { AUDIO_FORMATS, REPORTS, studioSchemas, type StudioRequest } from "@/lib/studio"
import type { Guide, Note, Source } from "@/lib/types"

export const anthropic = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY })

export const MODEL = "claude-haiku-5-5"

const GROUNDING =
  "Du arbeitest ausschließlich mit den bereitgestellten Quellen des Notebooks. Erfinde keine Fakten, die nicht in den Quellen stehen."

export async function chargeQuota(db: Db) {
  must(await db.rpc("consume_ai_quota"))
}

export async function sourceDocuments(db: Db, sources: Source[], citations: boolean) {
  const docs = await Promise.all(
    sources.map(async (s): Promise<Anthropic.DocumentBlockParam> => {
      const base = { type: "document" as const, title: s.title, citations: { enabled: citations } }
      if (s.kind === "pdf" && s.storage_path) {
        const { data, error } = await db.storage.from("sources").download(s.storage_path)
        if (error) throw new UserError(`PDF „${s.title}“ konnte nicht geladen werden`)
        const pdf = Buffer.from(await data.arrayBuffer()).toString("base64")
        return { ...base, source: { type: "base64", media_type: "application/pdf", data: pdf } }
      }
      return { ...base, source: { type: "text", media_type: "text/plain", data: s.content } }
    })
  )
  if (docs.length) docs[docs.length - 1].cache_control = { type: "ephemeral" }
  return docs
}

function text(message: Anthropic.Message) {
  if (message.stop_reason === "refusal") throw new UserError("Die Anfrage wurde von der KI abgelehnt")
  return message.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("").trim()
}

export async function fetchUrl(url: string) {
  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2000,
    output_config: { effort: "low" },
    tools: [{ type: "web_fetch_20250910", name: "web_fetch", max_uses: 1 }],
    messages: [{ role: "user", content: `Rufe ${url} mit dem Tool web_fetch ab und antworte danach nur mit OK.` }],
  })
  for (const block of message.content) {
    if (block.type !== "web_fetch_tool_result") continue
    if (block.content.type !== "web_fetch_result") break
    const doc = block.content.content
    return { title: doc.title || url, source: doc.source }
  }
  throw new UserError("Die Seite konnte nicht abgerufen werden")
}

export async function discoverSources(topic: string) {
  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4000,
    output_config: { effort: "low" },
    tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 2 }],
    messages: [
      {
        role: "user",
        content: `Suche im Web nach hochwertigen, informativen Quellen zum Thema: ${topic}. Antworte danach nur mit OK.`,
      },
    ],
  })
  const results = new Map<string, string>()
  for (const block of message.content) {
    if (block.type !== "web_search_tool_result" || !Array.isArray(block.content)) continue
    for (const r of block.content) if (!results.has(r.url)) results.set(r.url, r.title)
  }
  return [...results].slice(0, 10).map(([url, title]) => ({ url, title }))
}

function studioTask(req: StudioRequest) {
  const lang = `Schreibe auf ${req.language}.`
  switch (req.kind) {
    case "report":
      return `Erstelle ${REPORTS[req.type].prompt} auf Basis der Quellen. Nutze Markdown mit Überschriften, beginne mit einer H1-Überschrift als Titel. ${lang}`
    case "flashcards":
      return `Erstelle 15 bis 25 Lernkarteikarten zu den wichtigsten Konzepten, Fakten und Begriffen der Quellen. Vorderseite: Frage oder Begriff, Rückseite: kurze, präzise Antwort. ${lang}`
    case "quiz":
      return `Erstelle ein Multiple-Choice-Quiz mit 10 Fragen zu den Quellen. Jede Frage hat genau 4 Antwortoptionen, answer_index ist der 0-basierte Index der richtigen Option, explanation begründet die Antwort. ${lang}`
    case "mindmap":
      return `Erstelle eine Mindmap der Quellen: title ist das zentrale Thema, darunter 4 bis 7 Hauptäste mit je 2 bis 5 Unterthemen und je 0 bis 4 Detailpunkten. Kurze Stichworte. ${lang}`
    case "audio":
      return `Schreibe das Skript für einen Podcast mit zwei Moderatoren (A und B) über die Quellen: ${AUDIO_FORMATS[req.format].prompt}. Natürliche gesprochene Sprache, keine Regieanweisungen, kein Markdown, keine Aufzählungen. A eröffnet die Folge. ${lang}`
  }
}

export async function generateStudio(
  db: Db,
  sources: Source[],
  req: StudioRequest
): Promise<Pick<Note, "title" | "content" | "data">> {
  const documents = await sourceDocuments(db, sources, false)
  const base = {
    model: MODEL,
    max_tokens: 16000,
    system: GROUNDING,
    messages: [{ role: "user" as const, content: [...documents, { type: "text" as const, text: studioTask(req) }] }],
  }

  if (req.kind === "report") {
    const content = text(await anthropic.messages.create({ ...base, output_config: { effort: "medium" } }))
    const title = content.match(/^#\s+(.+)$/m)?.[1] ?? REPORTS[req.type].label
    return { title, content, data: { request: req } }
  }

  const message = await anthropic.messages.parse({
    ...base,
    output_config: { effort: "medium", format: zodOutputFormat(studioSchemas[req.kind]) },
  })
  if (message.stop_reason === "refusal") throw new UserError("Die Anfrage wurde von der KI abgelehnt")
  if (!message.parsed_output) throw new UserError("Die Antwort der KI war unvollständig")
  return { title: message.parsed_output.title, content: "", data: { ...message.parsed_output, language: req.language, request: req } }
}

const guideSchema = z.object({
  summary: z.string(),
  topics: z.array(z.string()),
  questions: z.array(z.string()),
})

export async function generateGuide(db: Db, sources: Source[]): Promise<Guide> {
  const documents = await sourceDocuments(db, sources, false)
  const message = await anthropic.messages.parse({
    model: MODEL,
    max_tokens: 4000,
    output_config: { effort: "low", format: zodOutputFormat(guideSchema) },
    system: GROUNDING,
    messages: [
      {
        role: "user",
        content: [
          ...documents,
          {
            type: "text",
            text: "Erstelle einen Überblick über alle Quellen: summary ist eine prägnante Zusammenfassung in 2 bis 3 Sätzen, topics sind 3 bis 6 zentrale Themen als kurze Stichworte, questions sind 3 kluge, konkrete Fragen, die man den Quellen stellen könnte. Schreibe in der Sprache der Quellen.",
          },
        ],
      },
    ],
  })
  if (!message.parsed_output) throw new UserError("Überblick konnte nicht erstellt werden")
  return message.parsed_output
}

export async function summarizeSource(db: Db, source: Source) {
  const [document] = await sourceDocuments(db, [source], false)
  return text(
    await anthropic.messages.create({
      model: MODEL,
      max_tokens: 2000,
      output_config: { effort: "low" },
      system: GROUNDING,
      messages: [
        {
          role: "user",
          content: [
            document,
            {
              type: "text",
              text: "Fasse diese Quelle in 3 bis 4 Sätzen zusammen und hebe die wichtigsten Begriffe **fett** hervor. Nur der Fließtext, keine Überschrift. Schreibe in der Sprache der Quelle.",
            },
          ],
        },
      ],
    })
  )
}

export const CHAT_SYSTEM = [
  "Du bist ein Recherche-Assistent in einem Notebook. Beantworte Fragen ausschließlich auf Basis der bereitgestellten Quellen und belege Aussagen mit Zitaten aus den Quellen.",
  "Wenn die Quellen keine Antwort enthalten, sag das offen. Antworte in der Sprache der Frage und nutze bei Bedarf Markdown.",
].join("\n\n")
