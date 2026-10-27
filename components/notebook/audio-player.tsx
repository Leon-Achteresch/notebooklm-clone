"use client"

import { Fragment, memo, useCallback, useEffect, useRef, useState } from "react"
import { AnimatePresence, motion, useMotionValue, useMotionValueEvent, useTransform, type MotionValue } from "motion/react"
import { ArrowUpIcon, DownloadIcon, HandIcon, MicIcon, PauseIcon, PlayIcon, RotateCcwIcon, RotateCwIcon, XIcon } from "lucide-react"
import { askHosts } from "@/app/notebook/actions"
import { Cover } from "@/components/notebook/brand"
import { Button } from "@/components/ui/button"
import { toast } from "@/components/ui/toast"
import { locate, peaks, speakable, type AudioTrack, type TimedTurn } from "@/lib/audio"
import { SPRING_LAYOUT, SPRING_PANEL, SPRING_PRESS, SPRING_SWAP } from "@/lib/ease"
import { HOSTS, LANGUAGES, type AudioScript, type Language } from "@/lib/studio"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"

type Turn = AudioScript["turns"][number]
type Position = { turn: number; word: number }
type Reply = { question: string; heard: number; turns: Turn[]; timed: TimedTurn[] | null; src: string | null }
type Stage = "listen" | "compose" | "thinking" | "answer"

const BARS = 112
const SPEEDS = [1, 1.25, 1.5]
const IDLE: Position = { turn: -1, word: -1 }
const FLAT = Array.from({ length: BARS }, (_, i) => 0.18 + Math.abs(Math.sin(i * 0.9)) * 0.12)

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`
const same = (a: Position, b: Position) => a.turn === b.turn && a.word === b.word

export function pickVoices(lang: string) {
  const score = (v: SpeechSynthesisVoice) =>
    (/premium|enhanced|natural|neural/i.test(v.name) ? 4 : 0) + (/google|microsoft/i.test(v.name) ? 2 : 0) + (v.localService ? 0 : 1)
  const voices = speechSynthesis
    .getVoices()
    .filter((v) => v.lang.toLowerCase().startsWith(lang))
    .sort((a, b) => score(b) - score(a))
  return [voices[0], voices[1] ?? voices[0]] as const
}

function speak(turns: Turn[], lang: string, rate: number, onTurn: (i: number) => void, onDone: () => void) {
  speechSynthesis.cancel()
  const [a, b] = pickVoices(lang)
  turns.forEach((turn, i) => {
    const utterance = new SpeechSynthesisUtterance(speakable(turn.text))
    utterance.lang = lang
    utterance.rate = rate
    utterance.voice = (turn.speaker === "A" ? a : b) ?? null
    if (a === b) utterance.pitch = turn.speaker === "A" ? 1.12 : 0.82
    utterance.onstart = () => onTurn(i)
    if (i === turns.length - 1) utterance.onend = onDone
    speechSynthesis.speak(utterance)
  })
}

type Recognizer = {
  lang: string
  interimResults: boolean
  onresult: ((e: SpeechRecognitionEvent) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
}

function recognition() {
  const w = window as unknown as { SpeechRecognition?: new () => Recognizer; webkitSpeechRecognition?: new () => Recognizer }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition
}

function useTrack(time: MotionValue<number>, timed: TimedTurn[] | null, source: () => number | undefined, active: boolean) {
  const [at, setAt] = useState(IDLE)
  const sync = useCallback(() => {
    const t = source()
    if (t === undefined) return
    time.set(t)
    const next = timed ? locate(timed, t) : IDLE
    setAt((prev) => (same(prev, next) ? prev : next))
  }, [time, timed, source])
  useEffect(() => {
    if (!active) return
    let frame = requestAnimationFrame(function tick() {
      sync()
      frame = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(frame)
  }, [active, sync])
  return [at, setAt, sync] as const
}

export function AudioPlayer({
  notebookId,
  noteId,
  script,
  track,
  language,
}: {
  notebookId: string
  noteId: string
  script: AudioScript
  track: AudioTrack
  language: Language
}) {
  const audio = useRef<HTMLAudioElement>(null)
  const reply = useRef<HTMLAudioElement | null>(null)
  const list = useRef<HTMLOListElement>(null)
  const [src, setSrc] = useState<string>()
  const [bars, setBars] = useState<number[]>()
  const [failed, setFailed] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [stage, setStage] = useState<Stage>("listen")
  const [replies, setReplies] = useState<Reply[]>([])
  const [blocked, setBlocked] = useState(false)
  const time = useMotionValue(0)
  const replyTime = useMotionValue(0)
  const lang = LANGUAGES[language] ?? "de"
  const last = replies.at(-1)

  const mainTime = useCallback(() => audio.current?.currentTime, [])
  const replyClock = useCallback(() => reply.current?.currentTime, [])
  const [at, , sync] = useTrack(time, track.turns, mainTime, playing)
  const [replyAt, setReplyAt] = useTrack(replyTime, last?.timed ?? null, replyClock, stage === "answer" && !!last?.timed)

  useEffect(() => {
    let url: string | undefined
    let live = true
    createClient()
      .storage.from("studio")
      .download(track.path)
      .then(async ({ data, error }) => {
        if (error) throw error
        if (!live) return
        url = URL.createObjectURL(data)
        setSrc(url)
        try {
          const decoded = await new OfflineAudioContext(1, 1, 44100).decodeAudioData(await data.arrayBuffer())
          if (live) setBars(peaks(decoded.getChannelData(0), BARS))
        } catch {}
      })
      .catch(() => live && setFailed(true))
    return () => {
      live = false
      if (url) URL.revokeObjectURL(url)
    }
  }, [track.path])

  useEffect(() => {
    if (audio.current) audio.current.playbackRate = speed
    if (reply.current) reply.current.playbackRate = speed
  }, [speed, src])

  useEffect(
    () => () => {
      reply.current?.pause()
      speechSynthesis.cancel()
    },
    []
  )

  useEffect(() => {
    if (playing) list.current?.querySelector(`[data-turn="${at.turn}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" })
  }, [at.turn, playing])

  const stopReply = () => {
    reply.current?.pause()
    reply.current = null
    speechSynthesis.cancel()
    setReplyAt(IDLE)
    setBlocked(false)
  }

  const resume = useCallback(() => {
    reply.current = null
    setReplyAt(IDLE)
    setStage("listen")
    audio.current?.play().catch(() => {})
  }, [setReplyAt])

  const toggle = () => {
    const el = audio.current
    if (!el) return
    if (stage !== "listen") {
      stopReply()
      setStage("listen")
    }
    if (el.paused) el.play().catch(() => {})
    else el.pause()
  }

  const seek = useCallback(
    (t: number) => {
      const el = audio.current
      if (!el) return
      el.currentTime = Math.min(Math.max(t, 0), track.duration)
      sync()
    },
    [track.duration, sync]
  )

  const skip = (delta: number) => seek((audio.current?.currentTime ?? 0) + delta)

  const startReply = (r: Reply) => {
    setBlocked(false)
    if (r.src) {
      const el = new Audio(r.src)
      el.playbackRate = speed
      el.onended = resume
      reply.current = el
      el.play().catch(() => setBlocked(true))
    } else speak(r.turns, lang, speed, (k) => setReplyAt({ turn: k, word: -1 }), resume)
  }

  const ask = async (question: string) => {
    setStage("thinking")
    const heard = Math.max(at.turn, 0)
    const result = await askHosts(notebookId, noteId, question, heard)
    if (!result.turns) {
      toast.add({ title: result.error ?? "Etwas ist schiefgelaufen", type: "error" })
      setStage("compose")
      return
    }
    const r: Reply = { question, heard, turns: result.turns, timed: result.audio?.turns ?? null, src: result.audio?.src ?? null }
    setReplies((all) => [...all, r])
    setStage("answer")
    startReply(r)
  }

  const raiseHand = () => {
    audio.current?.pause()
    stopReply()
    setStage("compose")
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (e.metaKey || e.ctrlKey || e.altKey || el.closest("input, textarea, select, [contenteditable=true]")) return
      if (e.key === " " && el.closest("button, a")) return
      const keys: Record<string, () => void> = {
        " ": toggle,
        k: toggle,
        ArrowLeft: () => skip(-5),
        ArrowRight: () => skip(5),
        j: () => skip(-10),
        l: () => skip(10),
      }
      const run = keys[e.key]
      if (!run) return
      e.preventDefault()
      run()
    }
    window.addEventListener("keydown", onKey, true)
    return () => window.removeEventListener("keydown", onKey, true)
  })

  if (failed)
    return <p className="text-sm text-muted-foreground">Die Audiodatei konnte nicht geladen werden. Bitte versuche es später erneut.</p>

  return (
    <div className="flex flex-col gap-5">
      <audio
        ref={audio}
        src={src}
        preload="auto"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onSeeked={sync}
      />
      <Cover seed={script.title} className="rounded-3xl p-5 text-neutral-900 sm:p-6">
        <div className="flex items-center gap-4 sm:gap-5">
          <motion.button
            onClick={toggle}
            disabled={!src}
            aria-label={playing ? "Pause" : "Abspielen"}
            whileHover={{ scale: 1.06 }}
            whileTap={{ scale: 0.92 }}
            transition={SPRING_PRESS}
            className="flex size-14 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-white shadow-lg disabled:opacity-60 sm:size-16"
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={playing ? "pause" : "play"}
                initial={{ scale: 0.5, opacity: 0, rotate: -30 }}
                animate={{ scale: 1, opacity: 1, rotate: 0 }}
                exit={{ scale: 0.5, opacity: 0, rotate: 30 }}
                transition={SPRING_SWAP}
              >
                {playing ? <PauseIcon className="size-6 fill-current" /> : <PlayIcon className="size-6 translate-x-0.5 fill-current" />}
              </motion.span>
            </AnimatePresence>
          </motion.button>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-3 font-mono text-[10.5px] tracking-widest text-neutral-900/60 uppercase">
              <span className="truncate">
                {HOSTS.A} & {HOSTS.B}
              </span>
              <Elapsed time={time} duration={track.duration} />
            </div>
            <Waveform bars={bars} duration={track.duration} time={time} onSeek={seek} />
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-x-1 gap-y-2">
          <CoverButton label="10 Sekunden zurück" onClick={() => skip(-10)}>
            <RotateCcwIcon className="size-4" />
          </CoverButton>
          <CoverButton label="10 Sekunden vor" onClick={() => skip(10)}>
            <RotateCwIcon className="size-4" />
          </CoverButton>
          <div className="relative flex">
            {SPEEDS.map((r) => (
              <button
                key={r}
                onClick={() => setSpeed(r)}
                aria-pressed={speed === r}
                className={cn(
                  "relative rounded-full px-2.5 py-1 font-mono text-xs transition-colors",
                  speed === r ? "text-white" : "text-neutral-900/70 hover:text-neutral-900"
                )}
              >
                {speed === r && (
                  <motion.span layoutId={`speed-${noteId}`} transition={SPRING_LAYOUT} className="absolute inset-0 rounded-full bg-neutral-900" />
                )}
                <span className="relative">{r}×</span>
              </button>
            ))}
          </div>
          {src && (
            <a
              href={src}
              download={`${script.title}.mp3`}
              aria-label="Als MP3 herunterladen"
              className="flex size-8 items-center justify-center rounded-full text-neutral-900/70 transition-colors hover:bg-neutral-900/10 hover:text-neutral-900"
            >
              <DownloadIcon className="size-4" />
            </a>
          )}
          <motion.button
            onClick={raiseHand}
            disabled={!src || stage === "thinking"}
            whileTap={{ scale: 0.95 }}
            transition={SPRING_PRESS}
            className="ml-auto flex items-center gap-2 rounded-full bg-white/75 px-3.5 py-1.5 text-sm font-medium shadow-sm backdrop-blur transition-colors hover:bg-white disabled:opacity-60"
          >
            <HandIcon className="size-4" />
            Mitreden
          </motion.button>
        </div>
      </Cover>

      <AnimatePresence initial={false}>
        {(stage === "compose" || stage === "thinking") && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={SPRING_PANEL}
            className="overflow-hidden"
          >
            <Composer
              thinking={stage === "thinking"}
              lang={lang}
              onAsk={ask}
              onCancel={() => {
                setStage("listen")
                audio.current?.play().catch(() => {})
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <ol ref={list} className="flex flex-col gap-0.5">
        {script.turns.map((turn, i) => (
          <Fragment key={i}>
            <Line
              index={i}
              turn={turn}
              timed={track.turns[i]}
              state={at.turn < 0 ? "idle" : i < at.turn ? "past" : i === at.turn ? "current" : "future"}
              word={i === at.turn ? at.word : -1}
              layoutId={`turn-${noteId}`}
              onSeek={seek}
            />
            {replies.map(
              (r, k) =>
                r.heard === i && (
                  <ReplyBlock
                    key={`reply-${k}`}
                    reply={r}
                    active={stage === "answer" && k === replies.length - 1}
                    at={k === replies.length - 1 ? replyAt : IDLE}
                    blocked={blocked && k === replies.length - 1}
                    onPlay={() => startReply(r)}
                    onSkip={() => {
                      stopReply()
                      resume()
                    }}
                    layoutId={`reply-${noteId}`}
                  />
                )
            )}
          </Fragment>
        ))}
      </ol>

      <p className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-muted-foreground">
        <span>Leertaste · Pause</span>
        <span>← → · 5 s</span>
        <span>Klick auf ein Wort · springen</span>
        <span className="ml-auto">Stimmen: ElevenLabs</span>
      </p>
    </div>
  )
}

function Elapsed({ time, duration }: { time: MotionValue<number>; duration: number }) {
  const [now, setNow] = useState(0)
  useMotionValueEvent(time, "change", (t) => setNow((prev) => (Math.floor(prev) === Math.floor(t) ? prev : t)))
  return (
    <span className="shrink-0 tabular-nums">
      {clock(now)} / {clock(duration)}
    </span>
  )
}

function CoverButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex size-8 items-center justify-center rounded-full text-neutral-900/70 transition-colors hover:bg-neutral-900/10 hover:text-neutral-900"
    >
      {children}
    </button>
  )
}

function Waveform({
  bars,
  duration,
  time,
  onSeek,
}: {
  bars: number[] | undefined
  duration: number
  time: MotionValue<number>
  onSeek: (t: number) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<number | null>(null)
  const [now, setNow] = useState(0)
  const clip = useTransform(time, (t) => `inset(0 ${100 - Math.min(100, (t / duration) * 100)}% 0 0)`)
  useMotionValueEvent(time, "change", (t) => setNow(Math.round(t)))
  const shape = bars ?? FLAT

  const ratio = (x: number) => {
    const rect = ref.current?.getBoundingClientRect()
    return rect ? Math.min(1, Math.max(0, (x - rect.left) / rect.width)) : 0
  }

  const row = (className: string) => (
    <div className={cn("absolute inset-0 flex items-center gap-[2px]", className)}>
      {shape.map((h, i) => (
        <motion.span
          key={i}
          className="w-full rounded-full bg-current"
          initial={false}
          animate={{ height: `${h * 100}%` }}
          transition={{ ...SPRING_LAYOUT, delay: bars ? i * 0.003 : 0 }}
        />
      ))}
    </div>
  )

  return (
    <div
      ref={ref}
      role="slider"
      tabIndex={0}
      aria-label="Wiedergabeposition"
      aria-valuemin={0}
      aria-valuemax={Math.round(duration)}
      aria-valuenow={now}
      aria-valuetext={`${clock(now)} von ${clock(duration)}`}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        onSeek(ratio(e.clientX) * duration)
      }}
      onPointerMove={(e) => {
        const r = ratio(e.clientX)
        setHover(r)
        if (e.currentTarget.hasPointerCapture(e.pointerId)) onSeek(r * duration)
      }}
      onPointerLeave={() => setHover(null)}
      className="relative mt-2 h-12 cursor-pointer touch-none rounded-md outline-none select-none focus-visible:ring-2 focus-visible:ring-neutral-900/40"
    >
      {row("text-neutral-900/20")}
      <motion.div className="absolute inset-0" style={{ clipPath: clip }}>
        {row("text-neutral-900")}
      </motion.div>
      {hover !== null && (
        <span className="pointer-events-none absolute inset-y-0 w-px bg-neutral-900/50" style={{ left: `${hover * 100}%` }}>
          <span className="absolute -top-5 -translate-x-1/2 rounded bg-neutral-900 px-1.5 py-0.5 font-mono text-[10px] text-white tabular-nums">
            {clock(hover * duration)}
          </span>
        </span>
      )}
    </div>
  )
}

type LineState = "idle" | "past" | "current" | "future"

const Line = memo(function Line({
  index,
  turn,
  timed,
  state,
  word,
  layoutId,
  onSeek,
}: {
  index: number
  turn: Turn
  timed: TimedTurn | undefined
  state: LineState
  word: number
  layoutId: string
  onSeek?: (t: number) => void
}) {
  const words = timed?.words.length ? timed.words : null
  return (
    <li data-turn={index} className="relative flex gap-4 rounded-xl p-3">
      {state === "current" && <motion.span layoutId={layoutId} transition={SPRING_LAYOUT} className="absolute inset-0 rounded-xl bg-muted" />}
      <button
        onClick={() => timed && onSeek?.(timed.start)}
        disabled={!onSeek || !timed}
        className={cn(
          "relative w-12 shrink-0 self-start pt-1 text-left font-mono text-[11px] tracking-wide uppercase",
          turn.speaker === "A" ? "text-signal" : "text-muted-foreground",
          onSeek && "hover:underline"
        )}
      >
        {HOSTS[turn.speaker]}
      </button>
      <p
        className={cn(
          "relative text-[15px] leading-relaxed transition-opacity duration-300",
          (state === "past" || state === "future") && "opacity-55"
        )}
      >
        {words
          ? words.map(([w, start], k) => (
              <Fragment key={k}>
                <span
                  onClick={onSeek && (() => onSeek(start))}
                  className={cn(
                    "rounded-[4px] transition-colors duration-150",
                    onSeek && "cursor-pointer hover:bg-foreground/5",
                    state === "current" && (k === word ? "bg-marker text-neutral-900" : k > word && "text-foreground/45")
                  )}
                >
                  {w}
                </span>{" "}
              </Fragment>
            ))
          : speakable(turn.text)}
      </p>
    </li>
  )
})

function ReplyBlock({
  reply,
  active,
  at,
  blocked,
  onPlay,
  onSkip,
  layoutId,
}: {
  reply: Reply
  active: boolean
  at: Position
  blocked: boolean
  onPlay: () => void
  onSkip: () => void
  layoutId: string
}) {
  const ref = useRef<HTMLLIElement>(null)
  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" })
  }, [active])
  return (
    <motion.li
      ref={ref}
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={SPRING_PANEL}
      className="my-2 rounded-2xl border border-signal/25 bg-signal/[0.04] p-2"
    >
      <div className="flex items-start gap-3 px-3 pt-2 pb-1">
        <HandIcon className="mt-1 size-4 shrink-0 text-signal" />
        <div className="min-w-0 flex-1">
          <p className="label text-signal">Deine Frage</p>
          <p className="mt-0.5 font-serif text-lg leading-snug">„{reply.question}“</p>
        </div>
        {active && (
          <Button size="xs" variant="ghost" onClick={onSkip}>
            Weiterhören
          </Button>
        )}
      </div>
      <ol>
        {reply.turns.map((turn, k) => (
          <Line
            key={k}
            index={-1 - k}
            turn={turn}
            timed={reply.timed?.[k]}
            state={!active || at.turn < 0 ? "idle" : k < at.turn ? "past" : k === at.turn ? "current" : "future"}
            word={k === at.turn ? at.word : -1}
            layoutId={layoutId}
          />
        ))}
      </ol>
      {blocked && (
        <div className="px-3 pb-2">
          <Button size="sm" onClick={onPlay}>
            <PlayIcon /> Antwort abspielen
          </Button>
        </div>
      )}
    </motion.li>
  )
}

function Composer({
  thinking,
  lang,
  onAsk,
  onCancel,
}: {
  thinking: boolean
  lang: string
  onAsk: (question: string) => void
  onCancel: () => void
}) {
  const [text, setText] = useState("")
  const [listening, setListening] = useState(false)
  const [canListen] = useState(() => !!recognition())
  const recognizer = useRef<Recognizer | null>(null)

  useEffect(() => () => recognizer.current?.stop(), [])

  const submit = (question: string) => {
    if (question.trim() && !thinking) onAsk(question.trim())
  }

  const listen = () => {
    if (recognizer.current) return recognizer.current.stop()
    const Recognition = recognition()
    if (!Recognition) return
    const r = new Recognition()
    let heard = ""
    r.lang = lang
    r.interimResults = true
    r.onresult = (e) => {
      heard = Array.from(e.results, (res) => res[0].transcript).join("")
      setText(heard)
    }
    r.onend = () => {
      recognizer.current = null
      setListening(false)
      submit(heard)
    }
    recognizer.current = r
    setListening(true)
    r.start()
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        submit(text)
      }}
      className="flex items-center gap-2 rounded-2xl border bg-card p-2 pl-4 shadow-sm"
    >
      {thinking ? (
        <p className="shimmer-text flex-1 py-1.5 text-sm" aria-live="polite">
          {HOSTS.A} und {HOSTS.B} überlegen …
        </p>
      ) : (
        <input
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={500}
          placeholder={listening ? "Ich höre zu …" : `Frag ${HOSTS.A} und ${HOSTS.B} etwas …`}
          aria-label="Deine Frage an die Moderatoren"
          className="min-w-0 flex-1 bg-transparent py-1.5 text-sm outline-none placeholder:text-muted-foreground"
        />
      )}
      {canListen && !thinking && (
        <Button
          type="button"
          size="icon-sm"
          variant={listening ? "default" : "ghost"}
          onClick={listen}
          aria-label={listening ? "Aufnahme beenden" : "Frage einsprechen"}
          aria-pressed={listening}
          className={cn(listening && "animate-pulse")}
        >
          <MicIcon />
        </Button>
      )}
      <Button type="submit" size="icon-sm" disabled={thinking || !text.trim()} aria-label="Frage senden">
        <ArrowUpIcon />
      </Button>
      <Button type="button" size="icon-sm" variant="ghost" onClick={onCancel} disabled={thinking} aria-label="Abbrechen">
        <XIcon />
      </Button>
    </form>
  )
}
