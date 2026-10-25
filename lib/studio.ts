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
  deep_dive: { label: "Deep Dive", prompt: "ein lebendiges, ausführliches Gespräch, das die Themen gründlich erkundet (ca. 30 bis 40 Wortwechsel)" },
  brief: { label: "Kurzfassung", prompt: "eine knappe Zusammenfassung der Kernpunkte (ca. 10 bis 14 Wortwechsel)" },
  critique: { label: "Kritik", prompt: "eine konstruktive, kritische Auseinandersetzung mit den Quellen inklusive Stärken und Schwächen (ca. 20 Wortwechsel)" },
  debate: { label: "Debatte", prompt: "eine Debatte, in der beide Sprecher gegensätzliche Positionen vertreten (ca. 20 Wortwechsel)" },
} as const

export const LANGUAGES = { Deutsch: "de", Englisch: "en", Französisch: "fr", Spanisch: "es", Italienisch: "it" } as const

export type ReportType = keyof typeof REPORTS
export type AudioFormat = keyof typeof AUDIO_FORMATS
export type Language = keyof typeof LANGUAGES

const keys = <T extends object>(o: T) => Object.keys(o) as [keyof T & string, ...(keyof T & string)[]]
const language = z.enum(keys(LANGUAGES))

export const studioRequestSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("report"), type: z.enum(keys(REPORTS)), language }),
  z.object({ kind: z.enum(["flashcards", "quiz", "mindmap"]), language }),
  z.object({ kind: z.literal("audio"), format: z.enum(keys(AUDIO_FORMATS)), language }),
])

export type StudioRequest = z.infer<typeof studioRequestSchema>

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
}

export type Flashcards = z.infer<typeof studioSchemas.flashcards>
export type Quiz = z.infer<typeof studioSchemas.quiz>
export type MindMap = z.infer<typeof studioSchemas.mindmap>
export type AudioScript = z.infer<typeof studioSchemas.audio>

export const KIND_LABELS = {
  note: "Notiz",
  report: "Bericht",
  flashcards: "Karteikarten",
  quiz: "Quiz",
  mindmap: "Mindmap",
  audio: "Audio-Zusammenfassung",
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
