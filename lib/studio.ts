import { z } from "zod"

export const REPORTS = {
  briefing: {
    label: "Briefing-Dokument",
    prompt: "ein Briefing-Dokument mit Executive Summary, den wichtigsten Themen, zentralen Erkenntnissen und wichtigen Zitaten",
  },
  study_guide: {
    label: "Lernleitfaden",
    prompt: "einen Lernleitfaden mit Kurzfragen samt Antworten, Essay-Fragen und einem Glossar der Schlüsselbegriffe",
  },
  faq: { label: "FAQ", prompt: "eine FAQ mit den 10 bis 15 wichtigsten Fragen und präzisen Antworten" },
  timeline: {
    label: "Zeitleiste",
    prompt: "eine chronologische Zeitleiste der Ereignisse sowie eine Liste der wichtigsten Personen mit Kurzbeschreibung",
  },
  blog: { label: "Blogpost", prompt: "einen gut lesbaren, ansprechenden Blogpost" },
} as const

export const AUDIO_FORMATS = {
  deep_dive: {
    label: "Deep Dive",
    hint: "≈ 4 Min. · gründlich",
    prompt: "ein lebendiges, ausführliches Gespräch, das die Themen gründlich erkundet, mit Beispielen und Aha-Momenten",
    chars: [3000, 3600],
  },
  brief: {
    label: "Kurzfassung",
    hint: "≈ 1 Min. · Kernpunkte",
    prompt: "eine knappe Zusammenfassung der Kernpunkte",
    chars: [900, 1200],
  },
  critique: {
    label: "Kritik",
    hint: "≈ 3 Min. · Stärken und Schwächen",
    prompt: "eine konstruktive, kritische Auseinandersetzung mit den Quellen inklusive Stärken, Schwächen und offenen Fragen",
    chars: [2000, 2500],
  },
  debate: {
    label: "Debatte",
    hint: "≈ 3 Min. · zwei Positionen",
    prompt: "eine Debatte, in der beide Sprecher gegensätzliche Positionen vertreten und mit Belegen aus den Quellen argumentieren",
    chars: [2000, 2500],
  },
} as const

export const LANGUAGES = { Deutsch: "de", Englisch: "en", Französisch: "fr", Spanisch: "es", Italienisch: "it" } as const

export const HOSTS = { A: "Mara", B: "Jonas" } as const

export type ReportType = keyof typeof REPORTS
export type AudioFormat = keyof typeof AUDIO_FORMATS
export type Language = keyof typeof LANGUAGES

const keys = <T extends object>(o: T) => Object.keys(o) as [keyof T & string, ...(keyof T & string)[]]
const language = z.enum(keys(LANGUAGES))
const focus = z.string().trim().max(500).optional()

export const studioRequestSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("report"), type: z.enum(keys(REPORTS)), language, focus }),
  z.object({ kind: z.enum(["flashcards", "quiz", "mindmap", "slides", "table"]), language, focus }),
  z.object({ kind: z.literal("audio"), format: z.enum(keys(AUDIO_FORMATS)), language, focus }),
])

export type StudioRequest = z.infer<typeof studioRequestSchema>

export const SLIDE_LAYOUTS = ["title", "bullets", "statement", "stat", "quote", "comparison", "timeline"] as const

export const studioSchemas = {
  flashcards: z.object({
    title: z.string(),
    cards: z.array(z.object({ front: z.string(), back: z.string() })),
  }),
  quiz: z.object({
    title: z.string(),
    questions: z.array(
      z.object({
        question: z.string(),
        options: z.array(z.string()),
        answer_index: z.number().int(),
        explanation: z.string(),
      })
    ),
  }),
  mindmap: z.object({
    title: z.string(),
    branches: z.array(
      z.object({
        title: z.string(),
        children: z.array(z.object({ title: z.string(), children: z.array(z.string()) })),
      })
    ),
  }),
  audio: z.object({
    title: z.string(),
    turns: z.array(z.object({ speaker: z.enum(["A", "B"]), text: z.string() })),
  }),
  slides: z.object({
    title: z.string(),
    subtitle: z.string(),
    slides: z.array(
      z.object({
        layout: z.enum(SLIDE_LAYOUTS),
        kicker: z.string(),
        heading: z.string(),
        body: z.string(),
        figure: z.string(),
        points: z.array(z.object({ label: z.string(), text: z.string() })),
        notes: z.string(),
      })
    ),
  }),
  table: z.object({
    title: z.string(),
    description: z.string(),
    columns: z.array(z.string()),
    rows: z.array(z.array(z.string())),
  }),
}

export type Flashcards = z.infer<typeof studioSchemas.flashcards>
export type Quiz = z.infer<typeof studioSchemas.quiz>
export type MindMap = z.infer<typeof studioSchemas.mindmap>
export type AudioScript = z.infer<typeof studioSchemas.audio>
export type Slides = z.infer<typeof studioSchemas.slides>
export type Slide = Slides["slides"][number]
export type DataTable = z.infer<typeof studioSchemas.table>

export const KIND_LABELS = {
  note: "Notiz",
  report: "Bericht",
  flashcards: "Karteikarten",
  quiz: "Quiz",
  mindmap: "Mindmap",
  audio: "Audio-Zusammenfassung",
  slides: "Präsentation",
  table: "Datentabelle",
} as const

export function studioLabel(req: StudioRequest) {
  if (req.kind === "report") return REPORTS[req.type].label
  if (req.kind === "audio") return `${KIND_LABELS.audio} · ${AUDIO_FORMATS[req.format].label}`
  return KIND_LABELS[req.kind]
}

export function parseStudioData<K extends keyof typeof studioSchemas>(kind: K, data: unknown) {
  const result = studioSchemas[kind].safeParse(data)
  return result.success ? (result.data as z.infer<(typeof studioSchemas)[K]>) : null
}
