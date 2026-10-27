import { z } from "zod"

const TAG = /\[[^\]]*\]/g

export const speakable = (text: string) => text.replace(TAG, " ").replace(/\s+/g, " ").trim()

export const audioTrackSchema = z.object({
  path: z.string(),
  duration: z.number(),
  model: z.string(),
  turns: z.array(
    z.object({
      start: z.number(),
      end: z.number(),
      words: z.array(z.tuple([z.string(), z.number(), z.number()])),
    })
  ),
})

export type AudioTrack = z.infer<typeof audioTrackSchema>
export type TimedTurn = AudioTrack["turns"][number]

export type Alignment = {
  characters: string[]
  character_start_times_seconds: number[]
  character_end_times_seconds: number[]
}

export type VoiceSegment = {
  start_time_seconds: number
  end_time_seconds: number
  character_start_index: number
  character_end_index: number
  dialogue_input_index: number
}

export function chunkTurns<T extends { text: string }>(turns: T[], max: number) {
  const chunks: T[][] = []
  let size = Infinity
  for (const turn of turns) {
    if (size + turn.text.length > max) {
      chunks.push([])
      size = 0
    }
    chunks[chunks.length - 1].push(turn)
    size += turn.text.length
  }
  return chunks
}

const round = (n: number) => Math.round(n * 1000) / 1000

export function timedTurns(count: number, segments: VoiceSegment[], alignment: Alignment, offset: number): TimedTurn[] {
  const { characters: chars, character_start_times_seconds: starts, character_end_times_seconds: ends } = alignment
  let last = offset
  return Array.from({ length: count }, (_, input) => {
    const own = segments.filter((s) => s.dialogue_input_index === input)
    const words: TimedTurn["words"] = []
    for (const segment of own) {
      let word = ""
      let from = 0
      let to = 0
      let tag = false
      const flush = () => {
        if (word) words.push([word, round(offset + from), round(offset + to)])
        word = ""
      }
      for (let i = segment.character_start_index; i < segment.character_end_index && i < chars.length; i++) {
        const c = chars[i]
        if (c === "[") {
          flush()
          tag = true
        } else if (tag) {
          tag = c !== "]"
        } else if (/\s/.test(c)) {
          flush()
        } else {
          if (!word) from = starts[i]
          word += c
          to = ends[i]
        }
      }
      flush()
    }
    const start = own.length ? round(offset + Math.min(...own.map((s) => s.start_time_seconds))) : last
    const end = own.length ? round(offset + Math.max(...own.map((s) => s.end_time_seconds))) : start
    last = end
    return { start, end, words }
  })
}

export function id3Size(bytes: Uint8Array) {
  if (bytes.length < 10 || bytes[0] !== 0x49 || bytes[1] !== 0x44 || bytes[2] !== 0x33) return 0
  const size = ((bytes[6] & 0x7f) << 21) | ((bytes[7] & 0x7f) << 14) | ((bytes[8] & 0x7f) << 7) | (bytes[9] & 0x7f)
  return 10 + size + (bytes[5] & 0x10 ? 10 : 0)
}

export const stripId3 = (bytes: Uint8Array) => bytes.subarray(id3Size(bytes))

export const MP3_BITRATE = 128000

export const mp3Duration = (bytes: Uint8Array) => ((bytes.length - id3Size(bytes)) * 8) / MP3_BITRATE

export function peaks(samples: Float32Array, bars: number) {
  const size = Math.max(1, Math.floor(samples.length / bars))
  const rms = Array.from({ length: bars }, (_, b) => {
    let sum = 0
    for (let i = b * size; i < Math.min((b + 1) * size, samples.length); i++) sum += samples[i] * samples[i]
    return Math.sqrt(sum / size)
  })
  const max = Math.max(...rms, 1e-6)
  return rms.map((v) => Math.round((0.08 + 0.92 * Math.sqrt(v / max)) * 1000) / 1000)
}

export function locate(turns: TimedTurn[], time: number) {
  let turn = -1
  for (let i = 0; i < turns.length && turns[i].start <= time; i++) turn = i
  if (turn < 0) return { turn, word: -1 }
  let word = -1
  for (const [i, w] of turns[turn].words.entries()) if (w[1] <= time) word = i
  return { turn, word }
}
