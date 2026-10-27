"use client"

import { useEffect, useEffectEvent, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react"
import {
  animate,
  AnimatePresence,
  motion,
  motionValue,
  useMotionValue,
  useReducedMotionConfig,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react"
import { FoldHorizontalIcon, MessageCircleQuestionIcon, MinusIcon, ScanIcon, UnfoldHorizontalIcon, ZoomInIcon, ZoomOutIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { SPRING_LAYOUT, SPRING_PANEL, SPRING_SWAP } from "@/lib/ease"
import { flattenMindMap, layoutMindMap, lineage, type LayoutNode, type MindMapItem, type Size } from "@/lib/mindmap-layout"
import type { MindMap } from "@/lib/studio"
import { cn } from "@/lib/utils"

type View = { x: number; y: number; k: number }
type Box = { x: number; y: number; width: number; height: number }
type Point = { x: number; y: number }
type Motion = Record<"x" | "y" | "scale" | "opacity", MotionValue<number>>

const PALETTE = [
  "[--tint:oklch(0.93_0.06_45)] [--ink:oklch(0.4_0.12_40)] [--line:oklch(0.74_0.12_45)] dark:[--tint:oklch(0.35_0.08_40)] dark:[--ink:oklch(0.92_0.05_50)] dark:[--line:oklch(0.62_0.11_45)]",
  "[--tint:oklch(0.93_0.04_250)] [--ink:oklch(0.38_0.1_255)] [--line:oklch(0.72_0.09_250)] dark:[--tint:oklch(0.33_0.06_255)] dark:[--ink:oklch(0.92_0.04_250)] dark:[--line:oklch(0.6_0.09_255)]",
  "[--tint:oklch(0.93_0.05_155)] [--ink:oklch(0.36_0.08_160)] [--line:oklch(0.72_0.1_155)] dark:[--tint:oklch(0.33_0.06_160)] dark:[--ink:oklch(0.92_0.05_155)] dark:[--line:oklch(0.6_0.09_160)]",
  "[--tint:oklch(0.93_0.05_300)] [--ink:oklch(0.38_0.12_300)] [--line:oklch(0.72_0.11_300)] dark:[--tint:oklch(0.33_0.07_300)] dark:[--ink:oklch(0.92_0.05_300)] dark:[--line:oklch(0.6_0.1_300)]",
  "[--tint:oklch(0.93_0.05_15)] [--ink:oklch(0.4_0.13_15)] [--line:oklch(0.73_0.12_15)] dark:[--tint:oklch(0.33_0.07_15)] dark:[--ink:oklch(0.92_0.05_15)] dark:[--line:oklch(0.62_0.11_15)]",
  "[--tint:oklch(0.93_0.06_95)] [--ink:oklch(0.4_0.09_90)] [--line:oklch(0.78_0.11_95)] dark:[--tint:oklch(0.35_0.07_90)] dark:[--ink:oklch(0.92_0.06_95)] dark:[--line:oklch(0.64_0.1_90)]",
]

const FACE = [
  "max-w-72 rounded-[1.75rem] bg-foreground px-6 py-3 font-serif text-[1.75rem] leading-[1.1] text-background",
  "max-w-60 rounded-[1.1rem] bg-(--tint) px-4 py-2 text-sm leading-snug font-medium text-(--ink)",
  "max-w-56 rounded-xl border border-(--line)/40 bg-card px-3 py-1.5 text-[13px] leading-snug",
  "max-w-52 rounded-lg bg-muted px-2.5 py-1 text-xs leading-snug text-muted-foreground",
]

const STROKE = [0, 2.25, 1.5, 1.1]
const EMERGE = 0.4
const ZOOM = { min: 0.15, max: 2.5, fit: 1.1, readable: 0.6 }
const ZOOM_KEYS: Record<string, number> = { "+": 1.25, "=": 1.25, "-": 0.8 }
const TOOLBAR = 56

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const faceClass = (item: MindMapItem) => cn(FACE[item.depth], item.depth > 0 && item.children.length > 0 && "pr-5")

function boxOf(nodes: Box[]): Box {
  const x = Math.min(...nodes.map((n) => n.x))
  const y = Math.min(...nodes.map((n) => n.y))
  return { x, y, width: Math.max(...nodes.map((n) => n.x + n.width)) - x, height: Math.max(...nodes.map((n) => n.y + n.height)) - y }
}

function fitView(box: Box, width: number, height: number, floor = ZOOM.readable): View {
  const pad = width < 480 ? 20 : 40
  const k = clamp(Math.min((width - 2 * pad) / box.width, (height - 2 * pad - TOOLBAR) / box.height), floor, ZOOM.fit)
  const x = box.width * k > width - 2 * pad ? pad - box.x * k : (width - box.width * k) / 2 - box.x * k
  return { k, x, y: (height - TOOLBAR - box.height * k) / 2 - box.y * k }
}

function reveal(view: View, box: Box, width: number, height: number, bottom = TOOLBAR): View {
  const m = 20
  const shift = (start: number, size: number, max: number) => (start < m || size > max - m ? m - start : Math.min(0, max - start - size))
  return {
    k: view.k,
    x: view.x + shift(view.x + box.x * view.k, box.width * view.k, width - m),
    y: view.y + shift(view.y + box.y * view.k, box.height * view.k, height - bottom),
  }
}

function question(path: string[]) {
  const topic = path.length > 2 ? path.slice(1, -1).join(" › ") : path.length === 2 ? path[0] : ""
  return `Erkläre anhand der Quellen: „${path.at(-1)}“${topic ? ` (Thema: „${topic}“)` : ""}`
}

export function MindMapCanvas({ data, onAsk }: { data: MindMap; onAsk?: (question: string) => void }) {
  const items = useMemo(() => flattenMindMap(data), [data])
  const labels = useMemo(() => new Map(items.map((item) => [item.id, item.label])), [items])
  const foldable = useMemo(() => items.filter((i) => i.depth > 0 && i.children.length > 0).map((i) => i.id), [items])
  const motions = useMemo(
    () => new Map(items.map((i) => [i.id, { x: motionValue(0), y: motionValue(0), scale: motionValue(1), opacity: motionValue(1) }])),
    [items]
  )
  const [measured, setMeasured] = useState<{ items: MindMapItem[]; sizes: Map<string, Size> }>()
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set())
  const [selected, setSelected] = useState<string>()
  const sizes = measured?.items === items ? measured.sizes : undefined
  const layout = useMemo(() => sizes && layoutMindMap(data, collapsed, (item) => sizes.get(item.id)!), [data, collapsed, sizes])
  const index = useMemo(() => new Map(layout?.nodes.map((n) => [n.id, n])), [layout])
  const path = new Set(selected ? lineage(selected) : [])
  const active = selected ? index.get(selected) : undefined

  const vx = useMotionValue(0)
  const vy = useMotionValue(0)
  const vk = useMotionValue(1)
  const vw = useMotionValue(0)
  const reduced = useReducedMotionConfig()
  const viewport = useRef<HTMLDivElement>(null)
  const measurer = useRef<HTMLDivElement>(null)
  const target = useRef<View>({ x: 0, y: 0, k: 1 })
  const flight = useRef<AnimationPlaybackControls[]>([])
  const manual = useRef(false)
  const refit = useRef(false)
  const gesture = useRef({ pointers: new Map<number, Point>(), start: { x: 0, y: 0 }, moved: false })

  const area = () => ({ width: viewport.current?.clientWidth ?? 0, height: viewport.current?.clientHeight ?? 0 })
  const current = (): View => ({ x: vx.get(), y: vy.get(), k: vk.get() })

  const setView = (to: View, animated = true) => {
    flight.current.forEach((c) => c.stop())
    target.current = to
    if (!animated || reduced) {
      vx.jump(to.x)
      vy.jump(to.y)
      vk.jump(to.k)
      flight.current = []
    } else flight.current = [animate(vx, to.x, SPRING_LAYOUT), animate(vy, to.y, SPRING_LAYOUT), animate(vk, to.k, SPRING_LAYOUT)]
  }

  const fit = (l = layout, animated = true, floor?: number) => {
    if (!l) return
    manual.current = false
    const { width, height } = area()
    setView(fitView(l.bounds, width, height, floor), animated)
  }

  const zoomAt = (factor: number, p: Point, animated: boolean) => {
    const from = animated ? target.current : current()
    const k = clamp(from.k * factor, ZOOM.min, ZOOM.max)
    manual.current = true
    setView({ k, x: p.x - ((p.x - from.x) * k) / from.k, y: p.y - ((p.y - from.y) * k) / from.k }, animated)
  }

  const zoomBy = (factor: number) => {
    const { width, height } = area()
    zoomAt(factor, { x: width / 2, y: height / 2 }, true)
  }

  const focusNode = (id?: string) => {
    if (id) viewport.current?.querySelector<HTMLElement>(`[data-node="${id}"]`)?.focus({ preventScroll: true })
  }

  const commit = (next: ReadonlySet<string>, anchor?: string) => {
    if (!layout || !sizes) return
    const after = layoutMindMap(data, next, (item) => sizes.get(item.id)!)
    const visible = new Set(after.nodes.map((n) => n.id))
    setCollapsed(next)
    if (!anchor) fit(after)
    else {
      const was = index.get(anchor)!
      const now = after.nodes.find((n) => n.id === anchor)!
      const { width, height } = area()
      const t = target.current
      let view = { k: t.k, x: t.x - (now.x - was.x) * t.k, y: t.y - (now.y - was.y) * t.k }
      if (!now.collapsed) view = reveal(view, boxOf(after.nodes.filter((n) => n.id.startsWith(`${anchor}-`))), width, height)
      manual.current = true
      setView(reveal(view, now, width, height))
    }
    if (selected && !visible.has(selected)) {
      const fallback = lineage(selected).findLast((id) => visible.has(id))
      setSelected(fallback)
      if (viewport.current?.contains(document.activeElement)) focusNode(fallback)
    }
  }

  const toggle = (id: string) => {
    const next = new Set(collapsed)
    if (!next.delete(id)) next.add(id)
    commit(next, id)
  }

  const ask = (id: string) => onAsk?.(question(lineage(id).map((i) => labels.get(i)!)))

  const select = (id: string) => {
    if (gesture.current.moved) return
    setSelected(id)
    focusNode(id)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return
    const node = index.get((e.target as HTMLElement).dataset.node ?? "")
    if (ZOOM_KEYS[e.key]) zoomBy(ZOOM_KEYS[e.key])
    else if (e.key === "0") fit(layout, true, ZOOM.min)
    else if (!node || !layout) return
    else if (e.key === "ArrowLeft") focusNode(node.parent)
    else if (e.key === "ArrowRight") {
      if (node.collapsed) toggle(node.id)
      else focusNode(node.children[0])
    } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      const column = layout.nodes.filter((n) => n.depth === node.depth)
      focusNode(column[column.indexOf(node) + (e.key === "ArrowUp" ? -1 : 1)]?.id)
    } else if (e.key === " ") {
      if (node.depth > 0 && node.children.length > 0) toggle(node.id)
    } else if (e.key === "Enter") ask(node.id)
    else return
    e.preventDefault()
  }

  const point = (e: { clientX: number; clientY: number }): Point => {
    const rect = viewport.current!.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button || (e.target as Element).closest("[data-ui]")) return
    const g = gesture.current
    if (!g.pointers.size) {
      g.moved = false
      g.start = point(e)
    }
    g.pointers.set(e.pointerId, point(e))
  }

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const g = gesture.current
    const last = g.pointers.get(e.pointerId)
    if (!last) return
    const p = point(e)
    if (!g.moved) {
      if (g.pointers.size < 2 && Math.hypot(p.x - g.start.x, p.y - g.start.y) < 4) return
      g.moved = true
      manual.current = true
      for (const id of g.pointers.keys()) e.currentTarget.setPointerCapture(id)
      e.currentTarget.dataset.panning = ""
    }
    g.pointers.set(e.pointerId, p)
    const other = [...g.pointers].find(([id]) => id !== e.pointerId)?.[1]
    const view = current()
    if (!other) return setView({ k: view.k, x: view.x + p.x - last.x, y: view.y + p.y - last.y }, false)
    const k = clamp((view.k * Math.hypot(p.x - other.x, p.y - other.y)) / Math.max(1, Math.hypot(last.x - other.x, last.y - other.y)), ZOOM.min, ZOOM.max)
    const was = { x: (last.x + other.x) / 2, y: (last.y + other.y) / 2 }
    setView({ k, x: (p.x + other.x) / 2 - ((was.x - view.x) * k) / view.k, y: (p.y + other.y) / 2 - ((was.y - view.y) * k) / view.k }, false)
  }

  const onPointerEnd = (e: PointerEvent<HTMLDivElement>) => {
    const g = gesture.current
    if (!g.pointers.delete(e.pointerId) || g.pointers.size) return
    delete e.currentTarget.dataset.panning
    if (!g.moved && e.type === "pointerup" && !(e.target as Element).closest("[role=treeitem]")) setSelected(undefined)
  }

  const onWheel = useEffectEvent((e: WheelEvent) => {
    e.preventDefault()
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 240 : 1
    if (e.ctrlKey || e.metaKey) return zoomAt(Math.exp(-clamp(e.deltaY * unit, -30, 30) / 100), point(e), false)
    const view = current()
    manual.current = true
    setView({ k: view.k, x: view.x - e.deltaX * unit, y: view.y - e.deltaY * unit }, false)
  })

  useEffect(() => {
    const el = viewport.current!
    const listener = (e: WheelEvent) => onWheel(e)
    el.addEventListener("wheel", listener, { passive: false })
    return () => el.removeEventListener("wheel", listener)
  }, [])

  const onMeasured = useEffectEvent((found: Map<string, Size>, first: boolean) => {
    if (first) {
      const deep = new Set(foldable.filter((id) => id.includes("-")))
      const { width, height } = area()
      const rich = fitView(layoutMindMap(data, deep, (item) => found.get(item.id)!).bounds, width, height).k >= 0.8
      setCollapsed(rich ? deep : new Set(foldable))
      setSelected(undefined)
      manual.current = false
    }
    refit.current = !manual.current
    setMeasured({ items, sizes: found })
  })

  const onResize = useEffectEvent(() => {
    if (!manual.current) fit(layout, false)
  })

  useEffect(() => {
    const port = viewport.current!
    const faces = [...measurer.current!.children] as HTMLElement[]
    let first = true
    const measure = () => {
      const found = new Map<string, Size>()
      for (const face of faces) {
        const box = face.getBoundingClientRect()
        const text = face.firstElementChild!.getBoundingClientRect()
        const scale = box.width / face.offsetWidth
        const { paddingRight, borderRightWidth } = getComputedStyle(face)
        if (!scale) return
        found.set(face.dataset.measure!, {
          width: Math.ceil((text.right - box.left) / scale + parseFloat(paddingRight) + parseFloat(borderRightWidth)),
          height: Math.ceil(box.height / scale),
        })
      }
      onMeasured(found, first)
      first = false
    }
    const observer = new ResizeObserver((entries) => {
      vw.set(port.clientWidth)
      if (entries.some((e) => e.target !== port)) measure()
      else onResize()
    })
    observer.observe(port)
    for (const face of faces) observer.observe(face)
    document.fonts.ready.then(() => !first && faces[0].isConnected && measure())
    return () => observer.disconnect()
  }, [items, vw])

  const settle = useEffectEvent(() => {
    if (!refit.current) return
    refit.current = false
    fit(layout, false)
  })

  useLayoutEffect(() => {
    if (layout) settle()
  }, [layout])

  const keepInView = useEffectEvent((id: string) => {
    const node = index.get(id)
    if (!node) return
    const { width, height } = area()
    const to = reveal(target.current, node, width, height, onAsk ? TOOLBAR + 40 : TOOLBAR)
    if (to.x === target.current.x && to.y === target.current.y) return
    manual.current = true
    setView(to)
  })

  useLayoutEffect(() => {
    if (selected) keepInView(selected)
  }, [selected])

  const allOpen = collapsed.size === 0
  const allClosed = foldable.every((id) => collapsed.has(id))

  return (
    <div
      ref={viewport}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onKeyDown={onKeyDown}
      className="relative h-full w-full cursor-grab touch-none overflow-clip select-none data-panning:cursor-grabbing"
    >
      <div ref={measurer} aria-hidden className="pointer-events-none invisible absolute top-0 left-0 flex flex-col items-start">
        {items.map((item) => (
          <div key={item.id} data-measure={item.id} className={faceClass(item)}>
            <span className="text-balance">{item.label}</span>
          </div>
        ))}
      </div>

      <motion.div role="tree" aria-label={data.title} className="absolute top-0 left-0 origin-top-left" style={{ x: vx, y: vy, scale: vk }}>
        <AnimatePresence custom={index}>
          {layout?.nodes.map((node) => (
            <MapNode
              key={node.id}
              node={node}
              parent={node.parent ? index.get(node.parent) : undefined}
              motions={motions}
              selected={selected === node.id}
              tone={!selected ? "rest" : path.has(node.id) ? "path" : "muted"}
              tabbable={(active?.id ?? "root") === node.id}
              onSelect={() => select(node.id)}
              onFocus={() => setSelected(node.id)}
              onToggle={() => toggle(node.id)}
              onAsk={onAsk && (() => ask(node.id))}
            />
          ))}
        </AnimatePresence>
      </motion.div>

      <AnimatePresence>
        {onAsk && active && (
          <AskAction key={active.id} node={active} mv={motions.get(active.id)!} view={{ x: vx, y: vy, k: vk, width: vw }} onAsk={() => ask(active.id)} />
        )}
      </AnimatePresence>

      <div data-ui className="absolute right-3 bottom-3 z-20 flex items-center gap-0.5 rounded-full border bg-background/85 p-1 shadow-sm backdrop-blur">
        <Button variant="ghost" size="icon-sm" className="rounded-full" aria-label="Verkleinern" title="Verkleinern" onClick={() => zoomBy(0.8)}>
          <ZoomOutIcon />
        </Button>
        <Button variant="ghost" size="icon-sm" className="rounded-full" aria-label="Vergrößern" title="Vergrößern" onClick={() => zoomBy(1.25)}>
          <ZoomInIcon />
        </Button>
        <Button variant="ghost" size="icon-sm" className="rounded-full" aria-label="Einpassen" title="Einpassen" onClick={() => fit(layout, true, ZOOM.min)}>
          <ScanIcon />
        </Button>
        <span className="mx-0.5 h-4 w-px bg-border" />
        <Button
          variant="ghost"
          size="icon-sm"
          className="rounded-full"
          aria-label="Alles aufklappen"
          title="Alles aufklappen"
          disabled={allOpen}
          onClick={() => commit(new Set())}
        >
          <UnfoldHorizontalIcon />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          className="rounded-full"
          aria-label="Alles einklappen"
          title="Alles einklappen"
          disabled={allClosed}
          onClick={() => commit(new Set(foldable))}
        >
          <FoldHorizontalIcon />
        </Button>
      </div>
    </div>
  )
}

function MapNode({
  node,
  parent,
  motions,
  selected,
  tone,
  tabbable,
  onSelect,
  onFocus,
  onToggle,
  onAsk,
}: {
  node: LayoutNode
  parent?: LayoutNode
  motions: Map<string, Motion>
  selected: boolean
  tone: "rest" | "path" | "muted"
  tabbable: boolean
  onSelect: () => void
  onFocus: () => void
  onToggle: () => void
  onAsk?: () => void
}) {
  const mv = motions.get(node.id)!
  const from = parent ? motions.get(parent.id)! : undefined
  const start =
    parent && from
      ? { x: from.x.get() + parent.width * from.scale.get() - node.width * EMERGE, y: from.y.get() + parent.height / 2 - node.height / 2 }
      : node
  const palette = PALETTE[node.branch % PALETTE.length]

  return (
    <>
      {parent && from && <Edge node={node} parent={parent} mv={mv} from={from} tone={tone} className={palette} />}
      <motion.div
        role="treeitem"
        data-node={node.id}
        aria-level={node.depth + 1}
        aria-posinset={parent ? parent.children.indexOf(node.id) + 1 : 1}
        aria-setsize={parent ? parent.children.length : 1}
        aria-expanded={node.children.length > 0 ? !node.collapsed : undefined}
        aria-selected={selected}
        tabIndex={tabbable ? 0 : -1}
        initial={{ x: start.x, y: start.y, scale: EMERGE, opacity: 0 }}
        animate={{ x: node.x, y: node.y, scale: 1, opacity: 1 }}
        exit="exit"
        variants={{
          exit: (index: Map<string, LayoutNode>) => {
            const anchor = index.get(lineage(node.id).findLast((id) => id !== node.id && index.has(id)) ?? "root")
            return anchor
              ? {
                  x: anchor.x + anchor.width - node.width * EMERGE,
                  y: anchor.y + anchor.height / 2 - node.height / 2,
                  scale: EMERGE,
                  opacity: 0,
                  transition: { ...SPRING_LAYOUT, opacity: { duration: 0.18 } },
                }
              : { opacity: 0 }
          },
        }}
        transition={{ ...SPRING_LAYOUT, opacity: { duration: 0.25 } }}
        style={{ ...mv, width: node.width, height: node.height, zIndex: 5 - node.depth, originX: 0, originY: 0.5 }}
        onMouseDown={(e) => e.preventDefault()}
        onClick={onSelect}
        onDoubleClick={onAsk}
        onFocus={(e) => e.target === e.currentTarget && onFocus()}
        className={cn(
          "absolute top-0 left-0 flex cursor-pointer items-center outline-offset-[3px] outline-(--ink)/60 in-data-panning:cursor-grabbing focus-visible:outline-2",
          faceClass(node),
          palette,
          node.depth === 0 && "outline-foreground/60",
          selected && "outline-2"
        )}
      >
        <span className="text-balance">{node.label}</span>
        {node.depth > 0 && node.children.length > 0 && (
          <span
            aria-hidden
            onClick={(e) => {
              e.stopPropagation()
              onToggle()
            }}
            className="absolute top-1/2 left-full flex size-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-(--line) bg-background font-mono text-[10px] font-medium text-(--ink) tabular-nums transition-colors after:absolute after:-inset-2.5 hover:bg-(--tint)"
          >
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={node.collapsed ? "closed" : "open"}
                initial={{ opacity: 0, scale: 0.5, rotate: -90 }}
                animate={{ opacity: 1, scale: 1, rotate: 0 }}
                exit={{ opacity: 0, scale: 0.5, rotate: 90 }}
                transition={SPRING_SWAP}
              >
                {node.collapsed ? node.children.length : <MinusIcon className="size-3" />}
              </motion.span>
            </AnimatePresence>
          </span>
        )}
      </motion.div>
    </>
  )
}

function Edge({
  node,
  parent,
  mv,
  from,
  tone,
  className,
}: {
  node: LayoutNode
  parent: LayoutNode
  mv: Motion
  from: Motion
  tone: "rest" | "path" | "muted"
  className: string
}) {
  const d = useTransform(() => {
    const x1 = from.x.get() + parent.width * from.scale.get() - 2
    const y1 = from.y.get() + parent.height / 2
    const x2 = mv.x.get() + 2
    const y2 = mv.y.get() + node.height / 2
    const bend = (x2 - x1) / 2
    return `M${x1} ${y1}C${x1 + bend} ${y1} ${x2 - bend} ${y2} ${x2} ${y2}`
  })
  return (
    <motion.svg aria-hidden className={cn("pointer-events-none absolute top-0 left-0 size-px overflow-visible", className)} style={{ opacity: mv.opacity }}>
      <motion.path
        d={d}
        fill="none"
        strokeWidth={STROKE[node.depth] + (tone === "path" ? 0.75 : 0)}
        className={cn(
          "stroke-(--line) transition-[opacity,stroke-width] duration-300",
          tone === "muted" ? "opacity-40" : tone === "rest" && node.depth > 1 ? "opacity-70" : "opacity-100"
        )}
      />
    </motion.svg>
  )
}

function AskAction({ node, mv, view, onAsk }: { node: LayoutNode; mv: Motion; view: Record<"x" | "y" | "k" | "width", MotionValue<number>>; onAsk: () => void }) {
  const width = useMotionValue(0)
  const open = node.children.length > 0 && !node.collapsed
  const edge = () => view.x.get() + view.k.get() * (mv.x.get() + node.width) + 18
  const beside = () => !open && edge() + width.get() + 12 <= view.width.get()
  const x = useTransform(() =>
    beside()
      ? edge()
      : clamp(view.x.get() + view.k.get() * (mv.x.get() + node.width / 2) - width.get() / 2, 8, view.width.get() - width.get() - 8)
  )
  const y = useTransform(() => view.y.get() + view.k.get() * (mv.y.get() + node.height / (beside() ? 2 : 1)) + (beside() ? -14 : 10))
  return (
    <motion.div
      data-ui
      ref={(el) => void (el && width.set(el.offsetWidth))}
      style={{ x, y }}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={SPRING_PANEL}
      className="absolute top-0 left-0 z-20"
    >
      <Button size="sm" className="rounded-full shadow-lg" onClick={onAsk}>
        <MessageCircleQuestionIcon /> Im Chat fragen
      </Button>
    </motion.div>
  )
}
