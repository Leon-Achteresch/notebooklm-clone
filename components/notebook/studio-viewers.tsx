"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { animate, AnimatePresence, motion, useMotionValue, useTransform, type PanInfo } from "motion/react"
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  PauseIcon,
  PlayIcon,
  RotateCcwIcon,
  ShuffleIcon,
} from "lucide-react"
import { Cover } from "@/components/notebook/brand"
import { Markdown } from "@/components/notebook/markdown"
import { Button } from "@/components/ui/button"
import { SPRING_LAYOUT, SPRING_PANEL, SPRING_PRESS, SPRING_SWAP } from "@/lib/ease"
import { pickVoices } from "@/components/notebook/audio-player"
import { speakable } from "@/lib/audio"
import { HOSTS, LANGUAGES, type AudioScript, type Flashcards, type Language, type Quiz } from "@/lib/studio"
import { cn } from "@/lib/utils"

export function ReportView({ content }: { content: string }) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING_LAYOUT}
      className="mx-auto max-w-[40rem]"
    >
      <Markdown>{content}</Markdown>
    </motion.article>
  )
}

function Progress({ value }: { value: number }) {
  return (
    <div className="h-1 overflow-hidden rounded-full bg-muted">
      <motion.div className="h-full origin-left rounded-full bg-foreground" animate={{ scaleX: value }} transition={SPRING_LAYOUT} />
    </div>
  )
}

const SWIPE = 80

export function FlashcardsView({ data }: { data: Flashcards }) {
  const [order, setOrder] = useState(() => data.cards.map((_, i) => i))
  const [[index, direction], setPosition] = useState<[number, number]>([0, 0])
  const [flipped, setFlipped] = useState(false)
  const total = data.cards.length
  const card = data.cards[order[index]]

  const go = (delta: number) => {
    setFlipped(false)
    setPosition(([i]) => [(i + delta + total) % total, delta])
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return
      if (e.key === "ArrowRight") go(1)
      else if (e.key === "ArrowLeft") go(-1)
      else if (e.key === " " && tag !== "BUTTON") {
        e.preventDefault()
        setFlipped((f) => !f)
      }
    }
    window.addEventListener("keydown", onKey, true)
    return () => window.removeEventListener("keydown", onKey, true)
  })

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.x < -SWIPE) go(1)
    else if (info.offset.x > SWIPE) go(-1)
  }

  if (!card) return null

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <Progress value={(index + 1) / total} />
      <div className="relative h-80 perspective-[1400px]">
        <AnimatePresence initial={false} custom={direction} mode="popLayout">
          <motion.div
            key={`${index}-${order[index]}`}
            custom={direction}
            variants={{
              enter: (d: number) => ({ x: d * 120, opacity: 0, rotate: d * 4 }),
              center: { x: 0, opacity: 1, rotate: 0 },
              exit: (d: number) => ({ x: d * -120, opacity: 0, rotate: d * -4 }),
            }}
            initial="enter"
            animate="center"
            exit="exit"
            transition={SPRING_SWAP}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.6}
            onDragEnd={onDragEnd}
            className="absolute inset-0 cursor-grab active:cursor-grabbing"
          >
            <motion.button
              onClick={() => setFlipped((f) => !f)}
              aria-label={flipped ? "Frage zeigen" : "Antwort zeigen"}
              animate={{ rotateY: flipped ? 180 : 0 }}
              transition={{ type: "spring", stiffness: 260, damping: 26 }}
              className="group relative size-full outline-none transform-3d"
            >
              <span className="absolute inset-0 flex flex-col rounded-3xl border bg-card p-8 shadow-[0_20px_50px_-20px_oklch(0_0_0/0.15)] backface-hidden group-focus-visible:ring-3 group-focus-visible:ring-ring/50">
                <span className="label">
                  Frage {index + 1} / {total}
                </span>
                <span className="flex flex-1 items-center justify-center text-center font-serif text-3xl leading-tight text-balance">
                  {card.front}
                </span>
                <span className="text-center text-xs text-muted-foreground">Leertaste oder Klick zum Umdrehen · wischen zum Blättern</span>
              </span>
              <span className="absolute inset-0 rotate-y-180 backface-hidden">
                <Cover seed={card.front} className="flex h-full flex-col rounded-3xl p-8 text-neutral-900">
                  <span className="font-mono text-[10.5px] tracking-widest text-neutral-900/60 uppercase">Antwort</span>
                  <span className="flex flex-1 items-center justify-center text-center text-xl leading-relaxed text-balance">
                    {card.back}
                  </span>
                </Cover>
              </span>
            </motion.button>
          </motion.div>
        </AnimatePresence>
      </div>
      <div className="flex items-center justify-center gap-2">
        <Button variant="outline" size="icon" className="rounded-full" onClick={() => go(-1)} aria-label="Vorherige Karte">
          <ChevronLeftIcon />
        </Button>
        <Button
          variant="ghost"
          className="rounded-full text-muted-foreground"
          onClick={() => {
            setOrder((o) => [...o].sort(() => Math.random() - 0.5))
            setPosition([0, 1])
            setFlipped(false)
          }}
        >
          <ShuffleIcon /> Mischen
        </Button>
        <Button variant="outline" size="icon" className="rounded-full" onClick={() => go(1)} aria-label="Nächste Karte">
          <ChevronRightIcon />
        </Button>
      </div>
    </div>
  )
}

const GOOD = "oklch(0.65 0.15 155)"

function CountUp({ to }: { to: number }) {
  const value = useMotionValue(0)
  const rounded = useTransform(value, (v) => Math.round(v))
  useEffect(() => {
    const controls = animate(value, to, { duration: 1.1, ease: [0.16, 1, 0.3, 1] })
    return () => controls.stop()
  }, [to, value])
  return <motion.span>{rounded}</motion.span>
}

export function QuizView({ data }: { data: Quiz }) {
  const [answers, setAnswers] = useState<number[]>([])
  const [index, setIndex] = useState(0)
  const total = data.questions.length
  const finished = index >= total
  const q = data.questions[index]
  const chosen = answers[index]
  const correct = data.questions.filter((item, i) => answers[i] === item.answer_index).length

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-8">
      <div className="flex gap-1">
        {data.questions.map((item, i) => (
          <motion.span
            key={i}
            className="h-1 flex-1 rounded-full bg-muted"
            animate={{
              backgroundColor:
                answers[i] === undefined
                  ? i === index
                    ? "var(--color-foreground)"
                    : "var(--color-muted)"
                  : answers[i] === item.answer_index
                    ? GOOD
                    : "var(--color-destructive)",
              opacity: answers[i] === undefined && i === index ? 0.4 : 1,
            }}
            transition={{ duration: 0.4 }}
          />
        ))}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {finished ? (
          <motion.div
            key="result"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={SPRING_PANEL}
            className="flex flex-col items-center py-10 text-center"
          >
            <span className="label">Ergebnis</span>
            <span className="mt-4 font-serif text-[7rem] leading-none tracking-tight tabular-nums">
              <CountUp to={correct} />
              <span className="text-muted-foreground italic">/{total}</span>
            </span>
            <p className="mt-4 max-w-xs text-muted-foreground">
              {correct === total
                ? "Fehlerfrei. Du kennst deine Quellen."
                : correct >= total * 0.7
                  ? "Stark. Ein paar Details lohnen einen zweiten Blick."
                  : "Guter Anfang. Die Karteikarten helfen beim Festigen."}
            </p>
            <Button
              className="mt-8 rounded-full"
              onClick={() => {
                setAnswers([])
                setIndex(0)
              }}
            >
              <RotateCcwIcon /> Noch einmal
            </Button>
          </motion.div>
        ) : (
          <motion.div
            key={index}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={SPRING_SWAP}
            className="flex flex-col gap-6"
          >
            <div>
              <span className="label">
                Frage {index + 1} von {total}
              </span>
              <h3 className="mt-3 font-serif text-3xl leading-tight text-balance">{q.question}</h3>
            </div>
            <div className="flex flex-col gap-2">
              {q.options.map((option, o) => {
                const isRight = chosen !== undefined && o === q.answer_index
                const isWrong = chosen === o && o !== q.answer_index
                return (
                  <motion.button
                    key={o}
                    disabled={chosen !== undefined}
                    onClick={() => setAnswers((a) => Object.assign([...a], { [index]: o }))}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{
                      opacity: chosen !== undefined && !isRight && !isWrong ? 0.45 : 1,
                      y: 0,
                      x: isWrong ? [0, -7, 7, -4, 4, 0] : 0,
                      scale: isRight ? [1, 1.02, 1] : 1,
                    }}
                    transition={{
                      ...SPRING_LAYOUT,
                      delay: chosen === undefined ? 0.06 * o : 0,
                      x: { duration: 0.4 },
                      scale: { duration: 0.35 },
                    }}
                    whileTap={chosen === undefined ? { scale: 0.98 } : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-xl border p-3 text-left text-[15px] transition-colors enabled:hover:border-foreground/30 enabled:hover:bg-muted/50",
                      isRight && "border-[oklch(0.65_0.15_155)] bg-[oklch(0.65_0.15_155/0.08)]",
                      isWrong && "border-destructive bg-destructive/5"
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-7 shrink-0 items-center justify-center rounded-full border font-mono text-xs transition-colors",
                        isRight && "border-transparent bg-[oklch(0.65_0.15_155)] text-white",
                        isWrong && "border-transparent bg-destructive text-white"
                      )}
                    >
                      {"ABCDEF"[o]}
                    </span>
                    {option}
                  </motion.button>
                )
              })}
            </div>
            <AnimatePresence>
              {chosen !== undefined && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  transition={SPRING_LAYOUT}
                  className="flex flex-col gap-4 overflow-hidden"
                >
                  <p className="rounded-xl bg-muted/60 p-4 text-sm leading-relaxed">
                    <span className="font-medium">{chosen === q.answer_index ? "Richtig. " : "Nicht ganz. "}</span>
                    {q.explanation}
                  </p>
                  <Button className="self-end rounded-full" onClick={() => setIndex((i) => i + 1)}>
                    {index + 1 === total ? "Ergebnis ansehen" : "Weiter"} <ChevronRightIcon />
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

const RATES = [1, 1.25, 1.5]

export function AudioView({ data, language = "Deutsch", narrator }: { data: AudioScript; language?: Language; narrator?: string }) {
  const [current, setCurrent] = useState(-1)
  const [state, setState] = useState<"idle" | "playing" | "paused">("idle")
  const [rate, setRate] = useState(1)
  const listRef = useRef<HTMLOListElement>(null)
  const lang = LANGUAGES[language] ?? "de"
  const bars = useMemo(
    () => Array.from({ length: 56 }, (_, i) => 0.25 + Math.abs(Math.sin(i * 1.7) * Math.cos(i * 0.35)) * 0.75),
    []
  )
  const progress = current < 0 ? 0 : (current + 1) / data.turns.length

  useEffect(() => {
    speechSynthesis.getVoices()
    return () => speechSynthesis.cancel()
  }, [])

  useEffect(() => {
    listRef.current?.children[current]?.scrollIntoView({ block: "nearest", behavior: "smooth" })
  }, [current])

  const play = (from: number, speed = rate) => {
    speechSynthesis.cancel()
    const [a, b] = pickVoices(lang)
    data.turns.slice(from).forEach((turn, k) => {
      const utterance = new SpeechSynthesisUtterance(speakable(turn.text))
      utterance.lang = lang
      utterance.rate = speed
      utterance.voice = (turn.speaker === "A" ? a : b) ?? null
      if (a === b) utterance.pitch = turn.speaker === "A" ? 1.12 : 0.82
      utterance.onstart = () => setCurrent(from + k)
      if (from + k === data.turns.length - 1)
        utterance.onend = () => {
          setState("idle")
          setCurrent(-1)
        }
      speechSynthesis.speak(utterance)
    })
    setState("playing")
  }

  const toggle = () => {
    if (state === "playing") {
      speechSynthesis.pause()
      setState("paused")
    } else if (state === "paused") {
      speechSynthesis.resume()
      setState("playing")
    } else play(0)
  }

  return (
    <div className="flex flex-col gap-6">
      <Cover seed={data.title} className="rounded-3xl p-6 text-neutral-900">
        <div className="flex items-center gap-5">
          <motion.button
            onClick={toggle}
            aria-label={state === "playing" ? "Pause" : "Abspielen"}
            whileHover={{ scale: 1.06 }}
            whileTap={{ scale: 0.92 }}
            transition={SPRING_PRESS}
            className="flex size-16 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-white shadow-lg"
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={state === "playing" ? "pause" : "play"}
                initial={{ scale: 0.5, opacity: 0, rotate: -30 }}
                animate={{ scale: 1, opacity: 1, rotate: 0 }}
                exit={{ scale: 0.5, opacity: 0, rotate: 30 }}
                transition={SPRING_SWAP}
              >
                {state === "playing" ? <PauseIcon className="size-6 fill-current" /> : <PlayIcon className="size-6 translate-x-0.5 fill-current" />}
              </motion.span>
            </AnimatePresence>
          </motion.button>
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[10.5px] tracking-widest text-neutral-900/60 uppercase">
              {narrator ?? `${HOSTS.A} & ${HOSTS.B}`} · Browser-Stimmen
            </p>
            <div className="mt-3 flex h-12 items-center gap-[3px]" aria-hidden>
              {bars.map((h, i) => (
                <motion.span
                  key={i}
                  className="w-full rounded-full"
                  initial={{ scaleY: 0 }}
                  animate={{
                    scaleY: state === "playing" ? [1, 0.45, 1] : 1,
                    backgroundColor: i / bars.length < progress ? "rgb(23 23 23)" : "rgb(23 23 23 / 0.25)",
                  }}
                  transition={{
                    scaleY:
                      state === "playing"
                        ? { duration: 1.1, repeat: Infinity, ease: "easeInOut", delay: (i % 9) * 0.09 }
                        : { ...SPRING_LAYOUT, delay: i * 0.008 },
                    backgroundColor: { duration: 0.3 },
                  }}
                  style={{ height: `${h * 100}%` }}
                />
              ))}
            </div>
          </div>
        </div>
        <div className="mt-5 flex items-center justify-between gap-2">
          <span className="font-mono text-xs text-neutral-900/70 tabular-nums">
            {current < 0 ? "Bereit" : `Abschnitt ${current + 1} / ${data.turns.length}`}
          </span>
          <div className="relative flex gap-1">
            {RATES.map((r) => (
              <button
                key={r}
                onClick={() => {
                  setRate(r)
                  if (state === "playing") play(Math.max(current, 0), r)
                }}
                className={cn(
                  "relative rounded-full px-2.5 py-1 font-mono text-xs transition-colors",
                  rate === r ? "text-white" : "text-neutral-900/70 hover:text-neutral-900"
                )}
              >
                {rate === r && (
                  <motion.span layoutId="audio-rate" transition={SPRING_LAYOUT} className="absolute inset-0 rounded-full bg-neutral-900" />
                )}
                <span className="relative">{r}×</span>
              </button>
            ))}
          </div>
        </div>
      </Cover>
      {!narrator && (
        <p className="-mt-3 px-1 text-xs text-muted-foreground">
          Für diese Folge standen keine KI-Stimmen zur Verfügung, deshalb liest dein Browser das Skript vor.
        </p>
      )}

      <ol ref={listRef} className="flex flex-col gap-1">
        {data.turns.map((turn, i) => (
          <li key={i}>
            <button onClick={() => play(i)} className="relative flex w-full gap-4 rounded-xl p-3 text-left transition-colors hover:bg-muted/40">
              {current === i && (
                <motion.span layoutId="audio-turn" transition={SPRING_LAYOUT} className="absolute inset-0 rounded-xl bg-muted" />
              )}
              <span
                className={cn(
                  "relative w-12 shrink-0 pt-0.5 font-mono text-[11px] tracking-wide uppercase",
                  turn.speaker === "A" ? "text-signal" : "text-muted-foreground"
                )}
              >
                {HOSTS[turn.speaker]}
              </span>
              <motion.span
                animate={{ opacity: current >= 0 && current !== i ? 0.55 : 1 }}
                transition={{ duration: 0.3 }}
                className="relative text-[15px] leading-relaxed"
              >
                {speakable(turn.text)}
              </motion.span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  )
}
