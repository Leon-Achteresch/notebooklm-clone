"use client"

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { AnimatePresence, motion } from "motion/react"
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  GalleryHorizontalIcon,
  MaximizeIcon,
  MinimizeIcon,
  NotebookTextIcon,
  PrinterIcon,
} from "lucide-react"
import { Cover } from "@/components/notebook/brand"
import { Button } from "@/components/ui/button"
import { SPRING_LAYOUT, SPRING_SWAP } from "@/lib/ease"
import type { Slide, Slides } from "@/lib/studio"
import { cn } from "@/lib/utils"

const W = 1280
const H = 720

const size = (text: string, steps: [number, number][]) => steps.find(([max]) => text.length <= max)?.[1] ?? steps.at(-1)![1]

function useScale<T extends HTMLElement>(fit: "width" | "contain") {
  const ref = useRef<T>(null)
  const [scale, setScale] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setScale(fit === "width" ? width / W : Math.min(width / W, height / H))
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [fit])
  return [ref, scale] as const
}

function Frame({ deck, index, total, children, className }: { deck: string; index: number; total: number; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("relative flex h-[720px] w-[1280px] flex-col overflow-hidden bg-card px-[112px] pt-[88px] pb-[72px] text-foreground", className)}>
      {children}
      <div className="absolute inset-x-[112px] bottom-[40px] flex items-center justify-between font-mono text-[15px] tracking-[0.18em] uppercase opacity-50">
        <span className="max-w-[820px] truncate">{deck}</span>
        <span className="tabular-nums">
          {String(index + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
        </span>
      </div>
    </div>
  )
}

function Kicker({ children, className }: { children: string; className?: string }) {
  if (!children) return null
  return <p className={cn("mb-7 font-mono text-[17px] tracking-[0.2em] text-signal uppercase", className)}>{children}</p>
}

export function SlideFace({ slide, deck, index, total }: { slide: Slide; deck: string; index: number; total: number }) {
  const frame = { deck, index, total }
  const heading = slide.heading || deck
  const points = slide.points.filter((p) => p.label || p.text)

  switch (slide.layout) {
    case "title":
      return (
        <Cover seed={deck} className="h-[720px] w-[1280px] text-neutral-900">
          <Frame {...frame} className="justify-end bg-transparent text-neutral-900">
            <Kicker className="text-neutral-900/70">{slide.kicker}</Kicker>
            <h2
              className="line-clamp-3 max-w-[1000px] font-serif leading-[0.95] tracking-[-0.02em] text-balance"
              style={{ fontSize: size(heading, [[24, 120], [48, 96], [80, 76], [Infinity, 60]]) }}
            >
              {heading}
            </h2>
            {slide.body && <p className="mt-8 line-clamp-2 max-w-[860px] text-[28px] leading-snug text-neutral-900/75">{slide.body}</p>}
            <div className="mb-16" />
          </Frame>
        </Cover>
      )
    case "statement":
      return (
        <Frame {...frame} className="justify-center">
          <Kicker>{slide.kicker}</Kicker>
          <h2
            className="line-clamp-4 max-w-[1000px] font-serif leading-[1.04] tracking-[-0.015em] text-balance"
            style={{ fontSize: size(heading, [[60, 80], [110, 64], [Infinity, 50]]) }}
          >
            {heading}
          </h2>
          {slide.body && (
            <p className="mt-10 line-clamp-3 max-w-[820px] border-l-4 border-marker pl-6 text-[25px] leading-relaxed text-muted-foreground">
              {slide.body}
            </p>
          )}
        </Frame>
      )
    case "stat":
      return (
        <Frame {...frame} className="justify-center">
          <Kicker>{slide.kicker}</Kicker>
          <div className="grid grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] items-center gap-[72px]">
            <p
              className="font-serif leading-[0.9] tracking-[-0.03em] break-words text-signal"
              style={{ fontSize: size(slide.figure, [[4, 240], [7, 180], [12, 120], [Infinity, 84]]) }}
            >
              {slide.figure || "—"}
            </p>
            <div>
              <h2 className="line-clamp-4 font-serif text-[44px] leading-[1.08] text-balance">{heading}</h2>
              {slide.body && <p className="mt-6 line-clamp-5 text-[23px] leading-relaxed text-muted-foreground">{slide.body}</p>}
            </div>
          </div>
        </Frame>
      )
    case "quote":
      return (
        <Frame {...frame} className="justify-center">
          <span aria-hidden className="absolute top-[24px] left-[84px] font-serif text-[300px] leading-none text-signal/15">
            „
          </span>
          <Kicker>{slide.kicker}</Kicker>
          <blockquote
            className="relative line-clamp-5 max-w-[1020px] font-serif leading-[1.12] italic text-balance"
            style={{ fontSize: size(heading, [[90, 64], [170, 50], [Infinity, 40]]) }}
          >
            {heading}
          </blockquote>
          {slide.body && <p className="mt-10 font-mono text-[18px] tracking-[0.16em] text-muted-foreground uppercase">— {slide.body}</p>}
        </Frame>
      )
    case "comparison": {
      const [a, b] = points
      return (
        <Frame {...frame}>
          <Kicker>{slide.kicker}</Kicker>
          <h2 className="line-clamp-2 max-w-[1000px] font-serif text-[52px] leading-[1.05] text-balance">{heading}</h2>
          <div className="relative mt-12 grid flex-1 grid-cols-2 gap-[56px]">
            {[a, b].map((p, i) => (
              <div key={i} className={cn("rounded-[28px] p-10", i ? "bg-muted" : "bg-signal/[0.08]")}>
                <p className={cn("font-serif text-[36px] leading-tight", !i && "text-signal")}>{p?.label}</p>
                <p className="mt-4 line-clamp-6 text-[22px] leading-relaxed text-muted-foreground">{p?.text}</p>
              </div>
            ))}
            <span className="absolute top-1/2 left-1/2 flex size-[64px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-foreground font-serif text-[22px] text-background italic">
              vs.
            </span>
          </div>
        </Frame>
      )
    }
    case "timeline":
      return (
        <Frame {...frame}>
          <Kicker>{slide.kicker}</Kicker>
          <h2 className="line-clamp-2 max-w-[1000px] font-serif text-[52px] leading-[1.05] text-balance">{heading}</h2>
          <div className="relative mt-auto mb-10">
            <div className="absolute top-[13px] right-0 left-0 h-[2px] bg-border" />
            <ol className="relative grid gap-8" style={{ gridTemplateColumns: `repeat(${Math.max(points.length, 1)}, minmax(0, 1fr))` }}>
              {points.map((p, i) => (
                <li key={i}>
                  <span className={cn("block size-[28px] rounded-full border-[6px] border-card", i === points.length - 1 ? "bg-signal" : "bg-foreground")} />
                  <p className="mt-6 font-mono text-[18px] tracking-[0.08em] text-signal">{p.label}</p>
                  <p className="mt-2 line-clamp-4 text-[20px] leading-snug">{p.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </Frame>
      )
    default:
      return (
        <Frame {...frame}>
          <Kicker>{slide.kicker}</Kicker>
          <h2 className="line-clamp-2 max-w-[1000px] font-serif text-[54px] leading-[1.05] text-balance">{heading}</h2>
          {points.length ? (
            <ol className={cn("mt-12 grid gap-x-[64px]", points.length > 3 && "grid-cols-2")}>
              {points.slice(0, 6).map((p, i) => (
                <li key={i} className="flex gap-6 border-t py-5">
                  <span className="pt-1 font-mono text-[17px] text-signal tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                  <p className={cn("line-clamp-3 leading-snug", points.length > 3 ? "text-[21px]" : "text-[25px]")}>
                    {p.label && <strong className="font-semibold">{p.label}. </strong>}
                    <span className="text-muted-foreground">{p.text}</span>
                  </p>
                </li>
              ))}
            </ol>
          ) : (
            slide.body && <p className="mt-10 line-clamp-6 max-w-[900px] text-[26px] leading-relaxed text-muted-foreground">{slide.body}</p>
          )}
        </Frame>
      )
  }
}

function Scaled({ scale, children }: { scale: number; children: React.ReactNode }) {
  return (
    <div style={{ width: W * scale, height: H * scale }} className="overflow-hidden">
      <div style={{ width: W, height: H, transform: `scale(${scale})`, transformOrigin: "top left" }}>{children}</div>
    </div>
  )
}

const PRINT_CSS = `@media print{@page{size:1280px 720px;margin:0}html,body{height:auto!important;overflow:visible!important;position:static!important}body>*:not([data-slides-print]){display:none!important}[data-slides-print]{display:block!important;print-color-adjust:exact;-webkit-print-color-adjust:exact}[data-slides-print]>div+div{break-before:page}}`

export function SlidesView({ data }: { data: Slides }) {
  const slides: Slide[] = data.slides.length
    ? data.slides
    : [{ layout: "title", kicker: "", heading: data.title, body: data.subtitle, figure: "", points: [], notes: "" }]
  const total = slides.length
  const [[index, direction], setPosition] = useState<[number, number]>([0, 0])
  const [thumbs, setThumbs] = useState(true)
  const [notes, setNotes] = useState(false)
  const [printing, setPrinting] = useState(false)
  const [full, setFull] = useState(false)
  const [stage, scale] = useScale<HTMLDivElement>("contain")
  const wrap = useRef<HTMLDivElement>(null)
  const swipe = useRef<number | null>(null)
  const slide = slides[index]

  const go = (to: number) => setPosition(([from]) => [Math.min(Math.max(to, 0), total - 1), Math.sign(to - from)])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (e.metaKey || e.ctrlKey || e.altKey || el.closest("input, textarea, select, [contenteditable=true]")) return
      if (e.key === " " && el.closest("button")) return
      const moves: Record<string, () => number> = {
        ArrowRight: () => index + 1,
        PageDown: () => index + 1,
        " ": () => index + 1,
        ArrowLeft: () => index - 1,
        PageUp: () => index - 1,
        Home: () => 0,
        End: () => total - 1,
      }
      const move = moves[e.key]
      if (!move) return
      e.preventDefault()
      go(move())
    }
    window.addEventListener("keydown", onKey, true)
    return () => window.removeEventListener("keydown", onKey, true)
  })

  useEffect(() => {
    const onChange = () => setFull(document.fullscreenElement === wrap.current)
    document.addEventListener("fullscreenchange", onChange)
    return () => document.removeEventListener("fullscreenchange", onChange)
  }, [])

  useEffect(() => {
    if (!printing) return
    const done = () => setPrinting(false)
    window.addEventListener("afterprint", done)
    const frame = requestAnimationFrame(() => window.print())
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener("afterprint", done)
    }
  }, [printing])

  const present = () => void (full ? document.exitFullscreen() : wrap.current?.requestFullscreen())?.catch(() => {})

  return (
    <div className="flex h-full min-h-[26rem] flex-col gap-4">
      <div
        ref={wrap}
        className={cn("relative flex min-h-0 flex-1 items-center justify-center [container-type:size]", full && "bg-black")}
        onPointerDown={(e) => (swipe.current = e.clientX)}
        onPointerUp={(e) => {
          if (swipe.current === null) return
          const dx = e.clientX - swipe.current
          swipe.current = null
          if (Math.abs(dx) > 60) go(index - Math.sign(dx))
        }}
      >
        <div
          ref={stage}
          role="region"
          aria-roledescription="Präsentation"
          aria-label={data.title}
          tabIndex={0}
          className={cn(
            "relative flex aspect-video w-[min(100cqw,calc(100cqh*16/9))] items-center justify-center overflow-hidden outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
            !full && "rounded-2xl shadow-[0_1px_2px_oklch(0_0_0/0.06),0_0_0_1px_oklch(0_0_0/0.07)] dark:shadow-[0_0_0_1px_oklch(1_0_0/0.1)]"
          )}
        >
          {scale > 0 && (
            <Scaled scale={scale}>
              <AnimatePresence initial={false} custom={direction} mode="popLayout">
                <motion.div
                  key={index}
                  custom={direction}
                  variants={{
                    enter: (d: number) => ({ x: d * 80, opacity: 0 }),
                    center: { x: 0, opacity: 1 },
                    exit: (d: number) => ({ x: d * -80, opacity: 0 }),
                  }}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ ...SPRING_SWAP, opacity: { duration: 0.2 } }}
                  role="group"
                  aria-roledescription="Folie"
                  aria-label={`Folie ${index + 1} von ${total}`}
                >
                  <SlideFace slide={slide} deck={data.title} index={index} total={total} />
                </motion.div>
              </AnimatePresence>
            </Scaled>
          )}
        </div>
        {full && (
          <div className="absolute right-6 bottom-6 flex gap-2 opacity-0 transition-opacity hover:opacity-100">
            <Button variant="secondary" size="icon" onClick={() => go(index - 1)} aria-label="Vorherige Folie">
              <ChevronLeftIcon />
            </Button>
            <Button variant="secondary" size="icon" onClick={() => go(index + 1)} aria-label="Nächste Folie">
              <ChevronRightIcon />
            </Button>
            <Button variant="secondary" size="icon" onClick={present} aria-label="Präsentation beenden">
              <MinimizeIcon />
            </Button>
          </div>
        )}
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-1">
        <Button variant="outline" size="icon-sm" onClick={() => go(index - 1)} disabled={index === 0} aria-label="Vorherige Folie">
          <ChevronLeftIcon />
        </Button>
        <span className="min-w-16 text-center font-mono text-xs tabular-nums" aria-live="polite">
          <span className="sr-only">Folie </span>
          {index + 1} / {total}
        </span>
        <Button variant="outline" size="icon-sm" onClick={() => go(index + 1)} disabled={index === total - 1} aria-label="Nächste Folie">
          <ChevronRightIcon />
        </Button>
        <span className="flex-1" />
        <Button variant={thumbs ? "secondary" : "ghost"} size="sm" onClick={() => setThumbs((t) => !t)} aria-pressed={thumbs}>
          <GalleryHorizontalIcon /> Übersicht
        </Button>
        <Button variant={notes ? "secondary" : "ghost"} size="sm" onClick={() => setNotes((n) => !n)} aria-pressed={notes}>
          <NotebookTextIcon /> Notizen
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setPrinting(true)}>
          <PrinterIcon /> Drucken
        </Button>
        <Button size="sm" onClick={present}>
          {full ? <MinimizeIcon /> : <MaximizeIcon />} Präsentieren
        </Button>
      </div>

      <AnimatePresence initial={false}>
        {notes && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={SPRING_LAYOUT}
            className="shrink-0 overflow-hidden"
          >
            <div className="rounded-xl bg-muted/60 p-4">
              <p className="label">Sprechernotizen</p>
              <p className="mt-1.5 text-[15px] leading-relaxed">{slide.notes || "Keine Notizen für diese Folie."}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {thumbs && (
        <ol className="-mx-1 flex shrink-0 gap-2.5 overflow-x-auto px-1 pt-1 pb-2" aria-label="Folienübersicht">
          {slides.map((s, i) => (
            <li key={i} className="shrink-0">
              <button
                onClick={() => go(i)}
                aria-label={`Folie ${i + 1}: ${s.heading}`}
                aria-current={i === index}
                className={cn(
                  "block overflow-hidden rounded-lg outline-none ring-offset-2 ring-offset-background transition-[box-shadow,opacity] focus-visible:ring-3 focus-visible:ring-ring/50",
                  i === index ? "ring-2 ring-signal" : "opacity-70 ring-1 ring-border hover:opacity-100"
                )}
              >
                <Scaled scale={0.1}>
                  <SlideFace slide={s} deck={data.title} index={i} total={total} />
                </Scaled>
              </button>
            </li>
          ))}
        </ol>
      )}

      {printing &&
        createPortal(
          <div data-slides-print className="hidden">
            <style>{PRINT_CSS}</style>
            {slides.map((s, i) => (
              <div key={i}>
                <SlideFace slide={s} deck={data.title} index={i} total={total} />
              </div>
            ))}
          </div>,
          document.body
        )}
    </div>
  )
}
