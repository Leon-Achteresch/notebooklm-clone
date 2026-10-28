import "server-only"
import Anthropic from "@anthropic-ai/sdk"
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod"
import { z } from "zod"
import { throttle } from "@/lib/rate-limit"
import { clientIp, must, UserError } from "@/lib/server/action"
import type { Json } from "@/lib/database.types"
import type { Db } from "@/lib/supabase/server"
import { AUDIO_FORMATS, HOSTS, REPORTS, STORY, studioSchemas, type AudioScript, type Language, type StudioRequest } from "@/lib/studio"
import type { Guide, Source } from "@/lib/types"

export const anthropic = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY })

export const MODEL = "claude-haiku-5-5"

const MAX_INPUT_TOKENS = 200_000

const GROUNDING =
  "Du arbeitest ausschließlich mit den bereitgestellten Quellen des Notebooks. Erfinde keine Fakten, die nicht in den Quellen stehen."

export async function chargeQuota(db: Db) {
  const [ip, { data }] = await Promise.all([clientIp(), db.auth.getClaims()])
  const wait = throttle(["ai", data?.claims.sub ?? ip], ["aiIp", ip], ["aiIpDay", ip])
  if (wait) throw new UserError(wait)
  must(await db.rpc("consume_ai_quota"))
}

export async function bounded(system: string, messages: Anthropic.MessageParam[]) {
  const { input_tokens } = await anthropic.messages.countTokens({ model: MODEL, system, messages })
  if (input_tokens > MAX_INPUT_TOKENS) throw new UserError("Die ausgewählten Quellen sind zu umfangreich. Wähle weniger Quellen aus.")
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
    tools: [{ type: "web_fetch_20250910", name: "web_fetch", max_uses: 1, max_content_tokens: 50_000 }],
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

const PODCAST_RULES = [
  `Die Moderatoren sind ${HOSTS.A} (Sprecherin A) und ${HOSTS.B} (Sprecher B). A eröffnet mit einem Einstieg, der neugierig macht, B schließt mit einem prägnanten Fazit.`,
  "Natürliche gesprochene Sprache: kurze Sätze, echte Rückfragen, Reaktionen und Aha-Momente; die beiden sprechen sich gelegentlich mit Namen an.",
  "Fakten, Zahlen und Beispiele stammen ausschließlich aus den Quellen.",
  "Setze sparsam Audio-Tags für Emotionen am Anfang eines Beitrags, insgesamt höchstens sechs, nur diese: [laughs], [curious], [excited], [sighs].",
  "Kein Markdown, keine Aufzählungen, keine Regieanweisungen außer den Audio-Tags, keine Namen als Präfix. Schreibe Zahlen und Abkürzungen so, wie man sie ausspricht. Jeder Beitrag höchstens 400 Zeichen.",
].join(" ")

function studioTask(req: StudioRequest) {
  const lang = `Schreibe auf ${req.language}.${req.focus ? ` Schwerpunkt des Nutzers: „${req.focus}“.` : ""}`
  switch (req.kind) {
    case "report":
      return `Erstelle ${REPORTS[req.type].prompt} auf Basis der Quellen. Nutze Markdown mit Überschriften, beginne mit einer H1-Überschrift als Titel. ${lang}`
    case "flashcards":
      return `Erstelle 15 bis 25 Lernkarteikarten zu den wichtigsten Konzepten, Fakten und Begriffen der Quellen. Vorderseite: Frage oder Begriff, Rückseite: kurze, präzise Antwort. ${lang}`
    case "quiz":
      return `Erstelle ein Multiple-Choice-Quiz mit 10 Fragen zu den Quellen. Jede Frage hat genau 4 Antwortoptionen, answer_index ist der 0-basierte Index der richtigen Option, explanation begründet die Antwort. ${lang}`
    case "mindmap":
      return `Erstelle eine Mindmap der Quellen: title ist das zentrale Thema, darunter 4 bis 7 Hauptäste mit je 2 bis 5 Unterthemen und je 0 bis 4 Detailpunkten. Kurze Stichworte. ${lang}`
    case "slides":
      return [
        "Erstelle eine Präsentation mit 8 bis 12 Folien auf Basis der Quellen. title ist der Titel, subtitle eine Unterzeile.",
        'Folie 1 hat das Layout "title" (heading = Titel, body = Unterzeile, kicker = Thema). Wähle danach je Folie das passende Layout und wechsle sie ab:',
        "bullets: heading und 3 bis 5 points (label = kurzes Stichwort, text = ein Satz).",
        "statement: heading ist eine Kernaussage mit höchstens 15 Wörtern, body optional.",
        "stat: figure ist eine markante Zahl aus den Quellen (z. B. „80 %“), heading erklärt sie, body gibt Kontext.",
        "quote: heading ist ein wörtliches Zitat aus den Quellen, body nennt die Quelle.",
        "comparison: heading und genau 2 points (label = Seite, text = 1 bis 3 Sätze).",
        "timeline: heading und 3 bis 6 points (label = Datum oder Zeitraum, text = Ereignis).",
        "Nutze stat, quote und timeline nur, wenn die Quellen passende Zahlen, Zitate oder Daten enthalten. kicker ist eine optionale kurze Überzeile, notes sind 2 bis 4 Sätze Sprechernotizen. Unbenutzte Felder sind leere Zeichenketten, unbenutzte points eine leere Liste. Knappe Folientexte, Details gehören in die Notizen.",
        lang,
      ].join(" ")
    case "table":
      return `Erstelle eine Datentabelle, die die wichtigsten vergleichbaren Fakten der Quellen strukturiert, etwa Akteure, Ereignisse, Kennzahlen oder Eigenschaften. title ist der Tabellentitel, description erklärt in einem Satz, was verglichen wird. 3 bis 7 aussagekräftige columns und 5 bis 20 rows; jede Zeile hat genau so viele Zellen wie Spalten, die erste Spalte benennt den Eintrag. Zellen kurz und präzise, Zahlen mit Einheit, „–“ wenn die Quellen nichts dazu sagen. ${lang}`
    case "audio": {
      const format = AUDIO_FORMATS[req.format]
      return `Schreibe das Skript für eine Audio-Zusammenfassung im Stil eines Podcasts über die Quellen: ${format.prompt}. Insgesamt ${format.chars[0]} bis ${format.chars[1]} Zeichen gesprochener Text. ${PODCAST_RULES} ${lang}`
    }
    case "story":
      return [
        `Verwandle die Quellen in ein Hörbuch zum Einschlafen: eine ruhige, warme Geschichte in genau ${STORY.episodes} Folgen, die man abends im Bett hört.`,
        "Figuren, Orte und Handlung darfst du erfinden; das Wissen, die Fakten und Zusammenhänge, die die Geschichte nebenbei vermittelt, stammen ausschließlich aus den Quellen.",
        "title ist der Titel der Reihe, synopsis ein Satz, der neugierig macht. Jede Folge hat einen eigenen title, greift am Anfang kurz auf, was zuletzt geschah, und endet sanft; nur die letzte Folge schließt die Geschichte ab und lässt sie friedlich ausklingen.",
        `Jede Folge ist ausführlich: ${STORY.turns[0]} bis ${STORY.turns[1]} turns mit je 280 bis 400 Zeichen, zusammen ${STORY.chars[0]} bis ${STORY.chars[1]} Zeichen, alle mit speaker A, gelesen von einer einzigen Erzählstimme.`,
        "Ruhiges Tempo, lange weiche Sätze, bildhafte Beschreibungen, keine Spannungsspitzen, keine Gewalt, kein Cliffhanger, der wach hält.",
        "Kein Markdown, keine Audio-Tags, keine Regieanweisungen. Schreibe Zahlen und Abkürzungen so, wie man sie ausspricht.",
        lang,
      ].join(" ")
  }
}

export async function generateStudio(
  db: Db,
  sources: Source[],
  req: StudioRequest
): Promise<{ title: string; content: string; data: { [key: string]: Json | undefined } }> {
  const documents = await sourceDocuments(db, sources, false)
  const base = {
    model: MODEL,
    max_tokens: 16000,
    thinking: { type: "disabled" as const },
    system: GROUNDING,
    messages: [{ role: "user" as const, content: [...documents, { type: "text" as const, text: studioTask(req) }] }],
  }
  await bounded(base.system, base.messages)

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
  const messages: Anthropic.MessageParam[] = [
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
  ]
  await bounded(GROUNDING, messages)
  const message = await anthropic.messages.parse({
    model: MODEL,
    max_tokens: 4000,
    output_config: { effort: "low", format: zodOutputFormat(guideSchema) },
    system: GROUNDING,
    messages,
  })
  if (!message.parsed_output) throw new UserError("Überblick konnte nicht erstellt werden")
  return message.parsed_output
}

export async function summarizeSource(db: Db, source: Source) {
  const [document] = await sourceDocuments(db, [source], false)
  const messages: Anthropic.MessageParam[] = [
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
  ]
  await bounded(GROUNDING, messages)
  return text(await anthropic.messages.create({ model: MODEL, max_tokens: 2000, output_config: { effort: "low" }, system: GROUNDING, messages }))
}

export const CHAT_SYSTEM = [
  "Du bist ein Recherche-Assistent in einem Notebook. Beantworte Fragen ausschließlich auf Basis der bereitgestellten Quellen und belege Aussagen mit Zitaten aus den Quellen.",
  "Wenn die Quellen keine Antwort enthalten, sag das offen. Antworte in der Sprache der Frage und nutze bei Bedarf Markdown.",
].join("\n\n")

const replySchema = z.object({ turns: studioSchemas.audio.shape.turns })

export async function answerListener(db: Db, sources: Source[], script: AudioScript, heard: number, question: string, language: Language) {
  const documents = await sourceDocuments(db, sources, false)
  const transcript = script.turns
    .slice(0, heard + 1)
    .map((t) => `${HOSTS[t.speaker]}: ${t.text}`)
    .join("\n")
  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: [
        ...documents,
        {
          type: "text",
          text: [
            `Du führst die Audio-Zusammenfassung „${script.title}“ fort. Bisher gesprochen:\n${transcript}`,
            `Eine Person aus dem Publikum unterbricht und fragt: „${question}“`,
            `Antworte als ${HOSTS.A} (A) und ${HOSTS.B} (B) in 2 bis 4 kurzen Beiträgen mit zusammen höchstens 600 Zeichen: Greift die Frage kurz auf, beantwortet sie präzise auf Basis der Quellen und leitet zurück zum Gespräch. Wenn die Quellen die Antwort nicht enthalten, sagt das ehrlich.`,
            `Natürliche gesprochene Sprache, kein Markdown, höchstens ein Audio-Tag aus [laughs], [curious], [excited], [sighs]. Antworte auf ${language}.`,
          ].join("\n\n"),
        },
      ],
    },
  ]
  await bounded(GROUNDING, messages)
  const message = await anthropic.messages.parse({
    model: MODEL,
    max_tokens: 2000,
    output_config: { effort: "low", format: zodOutputFormat(replySchema) },
    system: GROUNDING,
    messages,
  })
  if (message.stop_reason === "refusal") throw new UserError("Die Anfrage wurde von der KI abgelehnt")
  if (!message.parsed_output?.turns.length) throw new UserError("Die Antwort der KI war unvollständig")
  return message.parsed_output.turns
}
