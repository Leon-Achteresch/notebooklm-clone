import assert from "node:assert/strict"
import { test } from "node:test"
import { chunkTurns, episodeTracks, id3Size, locate, mp3Duration, peaks, speakable, stripId3, timedTurns, type Alignment } from "./audio.ts"

test("speakable removes audio tags and extra whitespace", () => {
  assert.equal(speakable("[curious] Wusstest du  das? [laughs]Ja."), "Wusstest du das? Ja.")
})

test("chunkTurns packs turns in order up to the limit", () => {
  const turns = ["aaaa", "bbb", "cc", "dddddddddd", "e"].map((text) => ({ text }))
  const chunks = chunkTurns(turns, 7).map((c) => c.map((t) => t.text).join("|"))
  assert.deepEqual(chunks, ["aaaa|bbb", "cc", "dddddddddd", "e"])
  assert.deepEqual(chunkTurns([], 7), [])
})

function align(texts: string[]) {
  const characters = [...texts.join("")]
  const alignment: Alignment = {
    characters,
    character_start_times_seconds: characters.map((_, i) => i / 10),
    character_end_times_seconds: characters.map((_, i) => (i + 1) / 10),
  }
  let at = 0
  const segments = texts.map((t, i) => {
    const segment = {
      start_time_seconds: at / 10,
      end_time_seconds: (at + t.length) / 10,
      character_start_index: at,
      character_end_index: at + t.length,
      dialogue_input_index: i,
    }
    at += t.length
    return segment
  })
  return { alignment, segments }
}

test("timedTurns builds word timings per input, skips tags and applies the offset", () => {
  const { alignment, segments } = align(["[curious] Hallo Welt.", "[laughs]Ja!"])
  const turns = timedTurns(2, segments, alignment, 10)
  assert.deepEqual(
    turns[0].words.map(([w]) => w),
    ["Hallo", "Welt."]
  )
  assert.deepEqual(turns[0].words[0], ["Hallo", 11, 11.5])
  assert.deepEqual(turns[1].words, [["Ja!", 12.9, 13.2]])
  assert.equal(turns[0].start, 10)
  assert.equal(turns[1].end, 13.2)
})

test("timedTurns keeps turns without segments in place", () => {
  const { alignment, segments } = align(["Eins."])
  const turns = timedTurns(2, segments, alignment, 0)
  assert.deepEqual(turns[1], { start: 0.5, end: 0.5, words: [] })
})

test("id3 header is measured, stripped and excluded from the duration", () => {
  const header = [0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 34]
  const bytes = new Uint8Array(44 + 16000)
  bytes.set(header)
  assert.equal(id3Size(bytes), 44)
  assert.equal(stripId3(bytes).length, 16000)
  assert.equal(mp3Duration(bytes), 1)
  assert.equal(id3Size(new Uint8Array([0xff, 0xfb, 0x90, 0x64])), 0)
})

test("peaks normalises loudness per bar with a visible floor", () => {
  const samples = new Float32Array([0, 0, 0.5, -0.5, 1, -1, 0, 0])
  assert.deepEqual(peaks(samples, 4), [0.08, 0.731, 1, 0.08])
})

test("locate finds the active turn and the last started word", () => {
  const turns = [
    { start: 0, end: 2, words: [["Hallo", 0, 0.5], ["Welt", 0.6, 1]] as [string, number, number][] },
    { start: 2.5, end: 4, words: [["Ja", 2.6, 3]] as [string, number, number][] },
  ]
  assert.deepEqual(locate(turns, 0.7), { turn: 0, word: 1 })
  assert.deepEqual(locate(turns, 2.5), { turn: 1, word: -1 })
  assert.deepEqual(locate(turns, 9), { turn: 1, word: 0 })
  assert.deepEqual(locate([], 1), { turn: -1, word: -1 })
})

test("episodeTracks keeps voiced episodes and ignores broken data", () => {
  const track = { path: "n/x-1.mp3", duration: 3, model: "eleven_v4_turbo", turns: [] }
  assert.deepEqual(episodeTracks({ tracks: { 1: track } }), { 1: track })
  assert.deepEqual(episodeTracks({ tracks: { 0: { path: 1 } } }), {})
  assert.deepEqual(episodeTracks(null), {})
})
