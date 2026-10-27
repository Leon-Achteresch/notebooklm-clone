import "server-only"
import { chunkTurns, mp3Duration, stripId3, timedTurns, type Alignment, type VoiceSegment } from "@/lib/audio"
import { must } from "@/lib/server/action"
import { LANGUAGES, type AudioScript, type Language } from "@/lib/studio"
import type { Db } from "@/lib/supabase/server"

const VOICES = { A: "cgSgspJ2msm6clMCkdW9", B: "NlRO8ABjJNJNYaRaLiPJ" } as const

const RATES = { eleven_v4: 0.3, eleven_v4_turbo: 0.15 } as const

export type TtsModel = keyof typeof RATES

export const PODCAST_MODEL: TtsModel = process.env.ELEVENLABS_PODCAST_MODEL === "eleven_v4" ? "eleven_v4" : "eleven_v4_turbo"

const MAX_CHARS = 1800

type Turns = AudioScript["turns"]

type DialogueResponse = { audio_base64: string; alignment: Alignment | null; voice_segments: VoiceSegment[] }

export async function claimTts(db: Db, notebookId: string, turns: Turns, model: TtsModel) {
  if (!process.env.ELEVENLABS_API_KEY) return false
  const chars = turns.reduce((sum, t) => sum + t.text.length, 0)
  const credits = Math.ceil(chars * RATES[model])
  return must(await db.rpc("claim_tts", { nid: notebookId, chars, credits, model })) !== null
}

async function dialogue(turns: Turns, language: Language, model: TtsModel) {
  const res = await fetch("https://api.elevenlabs.io/v1/text-to-dialogue/with-timestamps?output_format=mp3_44100_128", {
    method: "POST",
    headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY!, "content-type": "application/json" },
    body: JSON.stringify({
      model_id: model,
      language_code: LANGUAGES[language],
      inputs: turns.map((t) => ({ text: t.text, voice_id: VOICES[t.speaker] })),
    }),
    signal: AbortSignal.timeout(180_000),
  })
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 300)}`)
  return (await res.json()) as DialogueResponse
}

export async function synthesize(turns: Turns, language: Language, model: TtsModel) {
  const chunks = chunkTurns(turns, MAX_CHARS)
  const results = await Promise.all(chunks.map((chunk) => dialogue(chunk, language, model)))
  const parts: Uint8Array[] = []
  const timed = []
  let offset = 0
  for (const [i, result] of results.entries()) {
    const audio = stripId3(Buffer.from(result.audio_base64, "base64"))
    const alignment = result.alignment ?? { characters: [], character_start_times_seconds: [], character_end_times_seconds: [] }
    timed.push(...timedTurns(chunks[i].length, result.voice_segments, alignment, offset))
    offset += mp3Duration(audio)
    parts.push(audio)
  }
  return { audio: Buffer.concat(parts), duration: Math.round(offset * 1000) / 1000, turns: timed }
}
