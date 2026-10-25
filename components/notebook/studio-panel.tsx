"use client"

import { useEffect, useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import {
  AudioLinesIcon,
  ChevronDownIcon,
  FileTextIcon,
  LayersIcon,
  ListChecksIcon,
  NetworkIcon,
  NotebookPenIcon,
  PanelRightCloseIcon,
  PanelRightOpenIcon,
  PlayIcon,
  PlusIcon,
  RotateCwIcon,
} from "lucide-react"
import { deleteNote, generate, noteToSource, retryNote, saveNote } from "@/app/notebook/actions"
import { Cover } from "@/components/notebook/brand"
import { AudioView, FlashcardsView, MindMapView, QuizView, ReportView } from "@/components/notebook/studio-viewers"
import { useRun } from "@/components/notebook/use-run"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/components/ui/toast"
import { SPRING_LAYOUT, SPRING_PRESS } from "@/lib/ease"
import {
  AUDIO_FORMATS,
  KIND_LABELS,
  LANGUAGES,
  parseStudioData,
  REPORTS,
  type Language,
  type StudioRequest,
} from "@/lib/studio"
import type { Note, NoteKind } from "@/lib/types"
import { cn } from "@/lib/utils"

export const KINDS: Record<NoteKind, { label: string; hint: string; icon: typeof FileTextIcon; tint: string }> = {
  audio: {
    label: KIND_LABELS.audio,
    hint: "Zwei Stimmen sprechen über deine Quellen",
    icon: AudioLinesIcon,
    tint: "bg-[oklch(0.94_0.05_45)] text-[oklch(0.55_0.17_40)] dark:bg-[oklch(0.32_0.07_40)] dark:text-[oklch(0.82_0.12_50)]",
  },
  report: {
    label: KIND_LABELS.report,
    hint: "Briefing, FAQ, Zeitleiste …",
    icon: FileTextIcon,
    tint: "bg-[oklch(0.94_0.03_250)] text-[oklch(0.5_0.13_255)] dark:bg-[oklch(0.3_0.05_255)] dark:text-[oklch(0.8_0.09_250)]",
  },
  mindmap: {
    label: KIND_LABELS.mindmap,
    hint: "Themen auf einen Blick",
    icon: NetworkIcon,
    tint: "bg-[oklch(0.94_0.04_300)] text-[oklch(0.5_0.15_300)] dark:bg-[oklch(0.3_0.06_300)] dark:text-[oklch(0.8_0.1_300)]",
  },
  flashcards: {
    label: KIND_LABELS.flashcards,
    hint: "Begriffe und Fakten lernen",
    icon: LayersIcon,
    tint: "bg-[oklch(0.94_0.04_155)] text-[oklch(0.48_0.11_160)] dark:bg-[oklch(0.3_0.05_160)] dark:text-[oklch(0.8_0.09_155)]",
  },
  quiz: {
    label: KIND_LABELS.quiz,
    hint: "Wissen testen",
    icon: ListChecksIcon,
    tint: "bg-[oklch(0.94_0.04_10)] text-[oklch(0.53_0.17_15)] dark:bg-[oklch(0.3_0.06_15)] dark:text-[oklch(0.8_0.1_15)]",
  },
  note: {
    label: KIND_LABELS.note,
    hint: "",
    icon: NotebookPenIcon,
    tint: "bg-muted text-muted-foreground",
  },
}

function KindIcon({ kind, className }: { kind: NoteKind; className?: string }) {
  const { icon: Icon, tint } = KINDS[kind]
  return (
    <motion.span
      initial={{ scale: 0.6, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={SPRING_PRESS}
      className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", tint, className)}
    >
      <Icon className="size-4" />
    </motion.span>
  )
}

function Elapsed({ since }: { since: string }) {
  const [now, setNow] = useState<number | null>(null)
  useEffect(() => {
    const tick = () => setNow(Date.now())
    const first = setTimeout(tick, 0)
    const t = setInterval(tick, 1000)
    return () => {
      clearTimeout(first)
      clearInterval(t)
    }
  }, [])
  const s = now === null ? 0 : Math.max(0, Math.round((now - Date.parse(since)) / 1000))
  return (
    <span className="tabular-nums">
      {Math.floor(s / 60)}:{String(s % 60).padStart(2, "0")}
    </span>
  )
}

const press = { whileHover: { y: -2 }, whileTap: { scale: 0.97 }, transition: SPRING_PRESS }

export function StudioPanel({
  notebookId,
  notes,
  canEdit,
  hasSources,
  collapsed,
  onToggle,
}: {
  notebookId: string
  notes: Note[]
  canEdit: boolean
  hasSources: boolean
  collapsed: boolean
  onToggle: () => void
}) {
  const [language, setLanguage] = useState<Language>("Deutsch")
  const [openId, setOpenId] = useState<string | "new" | null>(null)
  const [awaiting, setAwaiting] = useState<string | null>(null)
  const [pending, run] = useRun()
  const open = openId === "new" ? null : notes.find((n) => n.id === openId && n.status === "ready")
  const disabled = !canEdit || !hasSources || pending

  const finished = notes.find((n) => n.id === awaiting && n.status !== "pending")
  if (finished) {
    setAwaiting(null)
    if (finished.status === "ready") setOpenId(finished.id)
  }

  const start = (req: StudioRequest) =>
    run(async () => {
      const result = await generate(notebookId, req)
      if (result.noteId) {
        setAwaiting(result.noteId)
        toast.add({ title: "Wird im Hintergrund erstellt", description: "Du kannst weiterarbeiten oder die Seite verlassen.", type: "info" })
      }
      return result
    })

  if (collapsed)
    return (
      <div className="hidden h-full flex-col items-center gap-2 py-3 lg:flex">
        <Button variant="ghost" size="icon-sm" onClick={onToggle} aria-label="Studio ausklappen">
          <PanelRightOpenIcon />
        </Button>
        {(["audio", "report", "mindmap", "flashcards", "quiz"] as const).map((kind, i) => (
          <motion.button
            key={kind}
            onClick={onToggle}
            title={KINDS[kind].label}
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ ...SPRING_LAYOUT, delay: i * 0.04 }}
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.94 }}
          >
            <KindIcon kind={kind} />
          </motion.button>
        ))}
      </div>
    )

  const options = (kind: "audio" | "report") => (
    <PopoverContent align="start" className="w-64 gap-0 p-1.5">
      <p className="label px-2 pt-1.5 pb-2">{kind === "audio" ? "Format wählen" : "Berichtsart wählen"}</p>
      {kind === "audio"
        ? (Object.keys(AUDIO_FORMATS) as (keyof typeof AUDIO_FORMATS)[]).map((format) => (
            <Option key={format} label={AUDIO_FORMATS[format].label} onPick={() => start({ kind, format, language })} />
          ))
        : (Object.keys(REPORTS) as (keyof typeof REPORTS)[]).map((type) => (
            <Option key={type} label={REPORTS[type].label} onPick={() => start({ kind, type, language })} />
          ))}
    </PopoverContent>
  )

  const tile = (kind: "mindmap" | "flashcards" | "quiz" | "report", index: number) => {
    const inner = (
      <>
        <KindIcon kind={kind} />
        <span className="mt-3 flex items-center gap-1 text-sm font-medium">
          {KINDS[kind].label}
          {kind === "report" && <ChevronDownIcon className="size-3.5 text-muted-foreground" />}
        </span>
        <span className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{KINDS[kind].hint}</span>
      </>
    )
    const props = {
      ...press,
      initial: { opacity: 0, y: 10 },
      animate: { opacity: 1, y: 0 },
      transition: { ...SPRING_LAYOUT, delay: 0.05 + index * 0.04 },
      className:
        "flex flex-col items-start rounded-xl border p-3 text-left transition-[background-color,border-color] enabled:hover:border-foreground/20 enabled:hover:bg-muted/40 disabled:opacity-50",
    }
    if (kind === "report")
      return (
        <Popover>
          <PopoverTrigger disabled={disabled} render={<motion.button {...props} />}>
            {inner}
          </PopoverTrigger>
          {options("report")}
        </Popover>
      )
    return (
      <motion.button disabled={disabled} onClick={() => start({ kind, language })} {...props}>
        {inner}
      </motion.button>
    )
  }

  return (
    <>
      <div className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
        <h2 className="label flex-1 pl-1">Studio</h2>
        <NativeSelect
          size="sm"
          value={language}
          onChange={(e) => setLanguage(e.target.value as Language)}
          aria-label="Ausgabesprache"
          className="w-auto"
        >
          {Object.keys(LANGUAGES).map((l) => (
            <NativeSelectOption key={l} value={l}>
              {l}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <Button variant="ghost" size="icon-sm" onClick={onToggle} aria-label="Studio einklappen" className="hidden lg:inline-flex">
          <PanelRightCloseIcon />
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div className="flex flex-col gap-2 p-3">
          <Popover>
            <PopoverTrigger
              disabled={disabled}
              render={
                <motion.button
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  whileTap={{ scale: 0.985 }}
                  transition={SPRING_LAYOUT}
                  className="group overflow-hidden rounded-2xl text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60"
                />
              }
            >
              <Cover seed="studio-audio-golden" className="flex items-end justify-between gap-3 p-4 text-neutral-900">
                <span>
                  <span className="font-mono text-[10px] tracking-widest text-neutral-900/60 uppercase">Audio</span>
                  <span className="mt-1 block font-serif text-2xl leading-none">Hör dir deine Quellen an</span>
                </span>
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-white transition-transform duration-300 group-enabled:group-hover:scale-110">
                  <PlayIcon className="size-4 translate-x-px fill-current" />
                </span>
              </Cover>
            </PopoverTrigger>
            {options("audio")}
          </Popover>
          <div className="grid grid-cols-2 gap-2">
            {tile("report", 0)}
            {tile("mindmap", 1)}
            {tile("flashcards", 2)}
            {tile("quiz", 3)}
          </div>
          {!hasSources && canEdit && <p className="px-1 text-xs text-muted-foreground">Wähle zuerst Quellen aus, um Inhalte zu erstellen.</p>}
        </div>

        <div className="flex items-center justify-between px-4 pt-3 pb-1">
          <h3 className="label">Erstellt & gespeichert</h3>
        </div>
        <ul className="flex flex-col gap-0.5 px-2 pb-3">
          <AnimatePresence initial={false}>
            {notes.map((n) => (
              <motion.li
                key={n.id}
                layout
                initial={{ opacity: 0, y: -8, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.15 } }}
                transition={SPRING_LAYOUT}
              >
                <NoteRow note={n} canEdit={canEdit} onOpen={() => setOpenId(n.id)} onRetry={() => run(() => retryNote(notebookId, n.id))} />
              </motion.li>
            ))}
          </AnimatePresence>
          {notes.length === 0 && (
            <li className="px-2 py-6 text-center text-sm text-muted-foreground">Erstellte Inhalte und gespeicherte Antworten landen hier.</li>
          )}
        </ul>
      </div>

      {canEdit && (
        <div className="border-t p-2">
          <Button variant="ghost" className="w-full justify-center" onClick={() => setOpenId("new")}>
            <NotebookPenIcon /> Notiz schreiben
          </Button>
        </div>
      )}

      <NoteDialog
        key={openId ?? "closed"}
        notebookId={notebookId}
        note={open ?? null}
        isNew={openId === "new"}
        canEdit={canEdit}
        onClose={() => setOpenId(null)}
      />
    </>
  )
}

function Option({ label, onPick }: { label: string; onPick: () => void }) {
  return (
    <button onClick={onPick} className="flex items-center justify-between rounded-md px-2 py-2 text-left text-sm hover:bg-muted">
      {label}
      <PlusIcon className="size-3.5 text-muted-foreground" />
    </button>
  )
}

function NoteRow({ note, canEdit, onOpen, onRetry }: { note: Note; canEdit: boolean; onOpen: () => void; onRetry: () => void }) {
  const date = new Date(note.created_at).toLocaleDateString("de-DE", { day: "numeric", month: "short" })

  if (note.status === "pending")
    return (
      <div className="flex items-center gap-3 rounded-xl p-2" aria-busy>
        <span className="wash size-8 shrink-0 rounded-lg" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm">{note.title}</span>
          <span className="shimmer-text block font-mono text-[11px]">
            Wird erstellt · <Elapsed since={note.created_at} />
          </span>
        </span>
      </div>
    )

  if (note.status === "failed")
    return (
      <div className="flex items-center gap-3 rounded-xl p-2">
        <KindIcon kind={note.kind} className="bg-destructive/10 text-destructive" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm">{note.title}</span>
          <span className="block truncate text-xs text-destructive">{note.error ?? "Fehlgeschlagen"}</span>
        </span>
        {canEdit && (
          <Button variant="ghost" size="icon-sm" onClick={onRetry} aria-label="Erneut versuchen">
            <RotateCwIcon />
          </Button>
        )}
      </div>
    )

  return (
    <motion.button
      onClick={onOpen}
      whileTap={{ scale: 0.98 }}
      transition={SPRING_PRESS}
      className="flex w-full items-center gap-3 rounded-xl p-2 text-left transition-colors hover:bg-muted/70"
    >
      <KindIcon kind={note.kind} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm">{note.title}</span>
        <span className="label block text-[9.5px]">
          {KINDS[note.kind].label} · {date}
        </span>
      </span>
    </motion.button>
  )
}

function NoteBody({ note }: { note: Note }) {
  const unreadable = <p className="text-sm text-muted-foreground">Dieser Inhalt hat ein unbekanntes Format.</p>
  switch (note.kind) {
    case "note":
      return null
    case "report":
      return <ReportView content={note.content} />
    case "flashcards": {
      const data = parseStudioData("flashcards", note.data)
      return data ? <FlashcardsView data={data} /> : unreadable
    }
    case "quiz": {
      const data = parseStudioData("quiz", note.data)
      return data ? <QuizView data={data} /> : unreadable
    }
    case "mindmap": {
      const data = parseStudioData("mindmap", note.data)
      return data ? <MindMapView data={data} /> : unreadable
    }
    case "audio": {
      const data = parseStudioData("audio", note.data)
      const language = (note.data as { language?: Language }).language
      return data ? <AudioView data={data} language={language} /> : unreadable
    }
  }
}

function NoteDialog({
  notebookId,
  note,
  isNew,
  canEdit,
  onClose,
}: {
  notebookId: string
  note: Note | null
  isNew: boolean
  canEdit: boolean
  onClose: () => void
}) {
  const [pending, run] = useRun()
  const editable = canEdit && (isNew || note?.kind === "note")
  const [title, setTitle] = useState(note?.title ?? "")
  const [content, setContent] = useState(note?.content ?? "")
  const kind = note?.kind ?? "note"

  return (
    <Dialog open={isNew || !!note} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex h-[min(88svh,56rem)] flex-col gap-0 p-0 sm:max-w-3xl">
        <div className="flex items-start gap-3 border-b px-6 pt-6 pb-4">
          <KindIcon kind={kind} />
          <div className="min-w-0 flex-1 pr-8">
            <p className="label">{KINDS[kind].label}</p>
            {editable ? (
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Titel der Notiz"
                aria-label="Titel"
                autoFocus={isNew}
                className="mt-1 w-full bg-transparent font-serif text-3xl leading-tight outline-none placeholder:text-muted-foreground/50"
              />
            ) : (
              <DialogTitle className="mt-1 font-serif text-3xl leading-tight font-normal">{note?.title}</DialogTitle>
            )}
          </div>
        </div>
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...SPRING_LAYOUT, delay: 0.08 }}
          className="min-h-0 flex-1 overflow-y-auto px-6 py-6"
        >
          {editable ? (
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Gedanken, Zitate, offene Fragen …"
              aria-label="Inhalt"
              className="h-full min-h-64 resize-none border-0 p-0 text-[15px] leading-relaxed shadow-none focus-visible:ring-0 dark:bg-transparent"
            />
          ) : (
            note && <NoteBody note={note} />
          )}
        </motion.div>
        {canEdit && (
          <div className="flex items-center justify-between gap-2 border-t px-4 py-3">
            {note ? (
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  disabled={pending}
                  onClick={() =>
                    confirm("Endgültig löschen?") &&
                    run(async () => {
                      const result = await deleteNote(notebookId, note.id)
                      if (!result.error) onClose()
                      return result
                    }, "Gelöscht")
                  }
                >
                  Löschen
                </Button>
                <Button variant="ghost" disabled={pending} onClick={() => run(() => noteToSource(notebookId, note.id), "Als Quelle hinzugefügt")}>
                  Als Quelle nutzen
                </Button>
              </div>
            ) : (
              <span />
            )}
            {editable && (
              <Button
                disabled={pending || !content.trim()}
                onClick={() =>
                  run(async () => {
                    const result = await saveNote(notebookId, { id: note?.id, title, content })
                    if (!result.error) onClose()
                    return result
                  }, "Gespeichert")
                }
              >
                Speichern
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
