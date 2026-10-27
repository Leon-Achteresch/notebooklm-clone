"use client"

import { useEffect, useOptimistic, useRef, useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import { useRouter } from "next/navigation"
import {
  ArrowUpRightIcon,
  FileTextIcon,
  GlobeIcon,
  LinkIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  PlusIcon,
  SearchIcon,
  SparklesIcon,
  Trash2Icon,
  TypeIcon,
  UploadIcon,
} from "lucide-react"
import {
  addFileSource,
  addTextSource,
  addUrlSource,
  deleteSource,
  discover,
  ensureSourceSummary,
  sourceDetails,
  updateSource,
} from "@/app/notebook/actions"
import { Markdown } from "@/components/notebook/markdown"
import { useRun } from "@/components/notebook/use-run"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import { Spinner } from "@/components/ui/spinner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/components/ui/toast"
import { SPRING_LAYOUT, SPRING_PANEL } from "@/lib/ease"
import { getFaviconUrl } from "@/lib/favicon"
import type { Citation, Source } from "@/lib/types"
import { cn } from "@/lib/utils"

export type SourceTarget = { source: Source; citation?: Citation }

const KIND_LABEL = { pdf: "PDF", url: "Web", text: "Text" }

const ACCEPT =
  ".pdf,.txt,.md,.markdown,.csv,.json,.html,.xml,.rtf,text/*,application/pdf"

function useUpload(notebookId: string) {
  const [pending, setPending] = useState<string[]>([])
  const router = useRouter()
  const upload = async (files: File[]) => {
    if (!files.length) return false
    setPending((p) => [...p, ...files.map((f) => f.name)])
    let ok = true
    for (const file of files) {
      const data = new FormData()
      data.set("file", file)
      const result = await addFileSource(notebookId, data)
      if (result.error) {
        ok = false
        toast.add({ title: `${file.name}: ${result.error}`, type: "error" })
      }
      setPending((p) => {
        const i = p.indexOf(file.name)
        return i < 0 ? p : [...p.slice(0, i), ...p.slice(i + 1)]
      })
    }
    router.refresh()
    return ok
  }
  return { pending, upload }
}

export function SourceIcon({
  source,
  className,
}: {
  source: Pick<Source, "kind" | "url">
  className?: string
}) {
  const [broken, setBroken] = useState(false)
  const favicon = source.url ? getFaviconUrl(source.url) : null
  const Icon =
    source.kind === "pdf"
      ? FileTextIcon
      : source.kind === "url"
        ? GlobeIcon
        : TypeIcon
  return (
    <span
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-lg",
        source.kind === "pdf" &&
          "bg-[oklch(0.95_0.04_35)] text-[oklch(0.55_0.17_35)] dark:bg-[oklch(0.3_0.06_35)] dark:text-[oklch(0.8_0.12_45)]",
        source.kind === "url" &&
          "bg-[oklch(0.95_0.03_240)] text-[oklch(0.5_0.13_250)] dark:bg-[oklch(0.3_0.05_250)] dark:text-[oklch(0.8_0.09_240)]",
        source.kind === "text" &&
          "bg-[oklch(0.95_0.03_150)] text-[oklch(0.5_0.1_160)] dark:bg-[oklch(0.3_0.05_160)] dark:text-[oklch(0.8_0.08_150)]",
        className
      )}
    >
      {favicon && !broken && source.kind === "url" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={favicon}
          alt=""
          className="size-4 rounded-sm"
          onError={() => setBroken(true)}
        />
      ) : (
        <Icon className="size-4" />
      )}
    </span>
  )
}

export function SourcesPanel({
  notebookId,
  sources: serverSources,
  canEdit,
  collapsed,
  onToggle,
  onAdd,
  onOpen,
}: {
  notebookId: string
  sources: Source[]
  canEdit: boolean
  collapsed: boolean
  onToggle: () => void
  onAdd: () => void
  onOpen: (target: SourceTarget) => void
}) {
  const [, run] = useRun()
  const [dragging, setDragging] = useState(false)
  const { pending, upload } = useUpload(notebookId)
  const [sources, apply] = useOptimistic(
    serverSources,
    (
      state,
      change:
        | { type: "select"; ids: string[]; selected: boolean }
        | { type: "delete"; id: string }
    ) =>
      change.type === "delete"
        ? state.filter((s) => s.id !== change.id)
        : state.map((s) =>
            change.ids.includes(s.id) ? { ...s, selected: change.selected } : s
          )
  )
  const select = (ids: string[], selected: boolean) =>
    run(async () => {
      apply({ type: "select", ids, selected })
      return updateSource(notebookId, ids, { selected })
    })
  const remove = (s: Source) =>
    confirm(`„${s.title}“ entfernen?`) &&
    run(async () => {
      apply({ type: "delete", id: s.id })
      return deleteSource(notebookId, s.id)
    }, "Quelle entfernt")
  const selected = sources.filter((s) => s.selected).length
  const allSelected = sources.length > 0 && selected === sources.length

  if (collapsed)
    return (
      <div className="hidden h-full flex-col items-center gap-2 py-3 lg:flex">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onToggle}
          aria-label="Quellen ausklappen"
        >
          <PanelLeftOpenIcon />
        </Button>
        {canEdit && (
          <Button
            size="icon-sm"
            className="rounded-full"
            onClick={onAdd}
            aria-label="Quelle hinzufügen"
          >
            <PlusIcon />
          </Button>
        )}
        <div className="mt-1 flex flex-col gap-1.5">
          {sources.map((s) => (
            <button
              key={s.id}
              onClick={() => onOpen({ source: s })}
              title={s.title}
              className={cn(!s.selected && "opacity-40")}
            >
              <SourceIcon source={s} />
            </button>
          ))}
        </div>
      </div>
    )

  return (
    <div
      className="relative flex min-h-0 flex-1 flex-col"
      onDragOver={(e) => {
        if (!canEdit || !e.dataTransfer.types.includes("Files")) return
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node))
          setDragging(false)
      }}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        if (canEdit) upload(Array.from(e.dataTransfer.files))
      }}
    >
      <div className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onToggle}
          aria-label="Quellen einklappen"
          className="hidden lg:inline-flex"
        >
          <PanelLeftCloseIcon />
        </Button>
        <h2 className="label flex-1 pl-1 lg:pl-0">
          Quellen <span className="text-foreground/40">{sources.length}</span>
        </h2>
        {canEdit && (
          <Button size="sm" className="rounded-full" onClick={onAdd}>
            <PlusIcon /> Hinzufügen
          </Button>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-2">
        {sources.length === 0 && pending.length === 0 ? (
          <button
            disabled={!canEdit}
            onClick={onAdd}
            className="m-2 flex flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-foreground/15 p-6 text-center transition-colors enabled:hover:border-foreground/40 enabled:hover:bg-muted/40"
          >
            <span className="flex size-11 items-center justify-center rounded-full bg-muted">
              <UploadIcon className="size-5 text-muted-foreground" />
            </span>
            <span className="font-serif text-2xl leading-tight">
              Noch leer.
            </span>
            <span className="max-w-52 text-sm text-muted-foreground">
              {canEdit
                ? "Zieh PDFs oder Textdateien hierher, füge Links ein oder durchsuche das Web."
                : "Hier erscheinen die Quellen."}
            </span>
          </button>
        ) : (
          <>
            <label className="flex items-center justify-between gap-2 rounded-lg px-2 py-2 text-xs text-muted-foreground">
              {selected} von {sources.length} im Gespräch
              <Checkbox
                checked={allSelected}
                indeterminate={selected > 0 && !allSelected}
                disabled={!canEdit || sources.length === 0}
                aria-label="Alle Quellen verwenden"
                onCheckedChange={(checked) =>
                  select(
                    sources.map((s) => s.id),
                    checked
                  )
                }
              />
            </label>
            <ul className="flex flex-col gap-0.5">
              <AnimatePresence initial={false}>
                {sources.map((s, i) => (
                  <motion.li
                    key={s.id}
                    layout
                    initial={{ opacity: 0, x: -10 }}
                    animate={{
                      opacity: 1,
                      x: 0,
                      transition: {
                        ...SPRING_LAYOUT,
                        delay: Math.min(i, 8) * 0.03,
                      },
                    }}
                    exit={{
                      opacity: 0,
                      x: -16,
                      transition: { duration: 0.18 },
                    }}
                    transition={SPRING_LAYOUT}
                    className="group flex items-center gap-2.5 rounded-xl p-1.5 pr-2 transition-colors hover:bg-muted/70"
                  >
                    <button
                      className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                      onClick={() => onOpen({ source: s })}
                    >
                      <SourceIcon
                        source={s}
                        className={cn(
                          "transition-opacity",
                          !s.selected && "opacity-45"
                        )}
                      />
                      <span className="min-w-0">
                        <span
                          className={cn(
                            "block truncate text-sm",
                            !s.selected && "text-muted-foreground"
                          )}
                        >
                          {s.title}
                        </span>
                        <span className="label block text-[9.5px]">
                          {KIND_LABEL[s.kind]}
                        </span>
                      </span>
                    </button>
                    {canEdit && (
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                        aria-label={`${s.title} löschen`}
                        onClick={() => remove(s)}
                      >
                        <Trash2Icon />
                      </Button>
                    )}
                    <Checkbox
                      checked={s.selected}
                      disabled={!canEdit}
                      aria-label={`${s.title} im Gespräch verwenden`}
                      onCheckedChange={(checked) => select([s.id], checked)}
                    />
                  </motion.li>
                ))}
                {pending.map((name, i) => (
                  <motion.li
                    key={`pending-${name}-${i}`}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, transition: { duration: 0.12 } }}
                    transition={SPRING_LAYOUT}
                    className="flex items-center gap-2.5 rounded-xl p-1.5"
                  >
                    <span className="wash size-8 shrink-0 rounded-lg" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm">{name}</span>
                      <span className="shimmer-text label block text-[9.5px]">
                        Wird importiert
                      </span>
                    </span>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          </>
        )}
      </div>

      <AnimatePresence>
        {dragging && (
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={SPRING_PANEL}
            className="pointer-events-none absolute inset-2 flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-signal bg-card/90 backdrop-blur-sm"
          >
            <motion.span
              animate={{ y: [0, -6, 0] }}
              transition={{
                duration: 1.2,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            >
              <UploadIcon className="size-6 text-signal" />
            </motion.span>
            <p className="font-serif text-2xl">Loslassen zum Hinzufügen</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export function AddSourceDialog({
  notebookId,
  open,
  onClose,
}: {
  notebookId: string
  open: boolean
  onClose: () => void
}) {
  const [pending, run] = useRun()
  const { pending: uploading, upload } = useUpload(notebookId)
  const [results, setResults] = useState<{ url: string; title: string }[]>([])
  const [picked, setPicked] = useState<string[]>([])
  const [over, setOver] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const busy = pending || uploading.length > 0

  const finish = (result: { error?: string }) => {
    if (!result.error) onClose()
    return result
  }
  const uploadAndClose = async (files: File[]) => {
    if (await upload(files)) onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="gap-6 p-6 sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="font-serif text-3xl font-normal">
            Quelle hinzufügen
          </DialogTitle>
          <DialogDescription>
            Antworten stützen sich nur auf das, was du hier hinzufügst.
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="file" className="gap-5">
          <TabsList
            variant="line"
            className="w-full justify-start gap-4 border-b pb-1"
          >
            <TabsTrigger value="file" className="flex-none px-0">
              <UploadIcon /> Datei
            </TabsTrigger>
            <TabsTrigger value="url" className="flex-none px-0">
              <LinkIcon /> Link
            </TabsTrigger>
            <TabsTrigger value="text" className="flex-none px-0">
              <TypeIcon /> Text
            </TabsTrigger>
            <TabsTrigger value="discover" className="flex-none px-0">
              <SparklesIcon /> Entdecken
            </TabsTrigger>
          </TabsList>

          <TabsContent value="file">
            <button
              type="button"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault()
                setOver(true)
              }}
              onDragLeave={() => setOver(false)}
              onDrop={(e) => {
                e.preventDefault()
                setOver(false)
                uploadAndClose(Array.from(e.dataTransfer.files))
              }}
              className={cn(
                "flex h-52 w-full flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-foreground/20 transition-colors hover:border-foreground/40 hover:bg-muted/40",
                over && "border-signal bg-signal/5"
              )}
            >
              {uploading.length ? (
                <>
                  <Spinner className="size-5" />
                  <span className="shimmer-text text-sm">
                    {uploading.length} Datei(en) werden importiert
                  </span>
                </>
              ) : (
                <>
                  <span className="flex size-12 items-center justify-center rounded-full bg-foreground text-background">
                    <UploadIcon className="size-5" />
                  </span>
                  <span className="font-serif text-2xl">
                    Dateien hierher ziehen
                  </span>
                  <span className="text-sm text-muted-foreground">
                    oder klicken · PDF bis 30 MB, Text, Markdown, CSV
                  </span>
                </>
              )}
            </button>
            <input
              ref={fileRef}
              type="file"
              multiple
              hidden
              accept={ACCEPT}
              onChange={(e) => {
                uploadAndClose(Array.from(e.target.files ?? []))
                e.target.value = ""
              }}
            />
          </TabsContent>

          <TabsContent value="url">
            <form
              className="flex flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault()
                const url = String(new FormData(e.currentTarget).get("url"))
                run(
                  async () => finish(await addUrlSource(notebookId, url)),
                  "Seite importiert"
                )
              }}
            >
              <div className="relative">
                <GlobeIcon className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="url"
                  name="url"
                  required
                  placeholder="https://…"
                  aria-label="Link"
                  className="h-11 pl-9"
                  autoFocus
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Webseiten und PDF-Links. Der Inhalt wird einmalig abgerufen und
                gespeichert.
              </p>
              <Button type="submit" disabled={pending} className="self-end">
                {pending && <Spinner />} Importieren
              </Button>
            </form>
          </TabsContent>

          <TabsContent value="text">
            <form
              className="flex flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault()
                const data = new FormData(e.currentTarget)
                run(
                  async () =>
                    finish(
                      await addTextSource(
                        notebookId,
                        String(data.get("title")),
                        String(data.get("content"))
                      )
                    ),
                  "Text hinzugefügt"
                )
              }}
            >
              <Input
                name="title"
                placeholder="Titel (optional)"
                aria-label="Titel"
                className="h-11"
              />
              <Textarea
                name="content"
                required
                rows={9}
                placeholder="Notizen, Artikel, Transkripte …"
                aria-label="Text"
              />
              <Button type="submit" disabled={pending} className="self-end">
                {pending && <Spinner />} Hinzufügen
              </Button>
            </form>
          </TabsContent>

          <TabsContent value="discover" className="flex flex-col gap-4">
            <form
              className="relative"
              onSubmit={(e) => {
                e.preventDefault()
                const topic = String(new FormData(e.currentTarget).get("topic"))
                run(async () => {
                  const result = await discover(notebookId, topic)
                  setResults(result.results ?? [])
                  setPicked((result.results ?? []).map((r) => r.url))
                  return result
                })
              }}
            >
              <SearchIcon className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                name="topic"
                required
                placeholder="Worüber möchtest du lernen?"
                aria-label="Thema"
                className="h-11 pr-24 pl-9"
              />
              <Button
                type="submit"
                size="sm"
                disabled={pending}
                className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded-full"
              >
                {pending && !results.length ? <Spinner /> : null} Suchen
              </Button>
            </form>
            {pending && !results.length && (
              <div className="flex flex-col gap-2">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="wash h-14 rounded-xl"
                    style={{ animationDelay: `${i * 160}ms` }}
                  />
                ))}
              </div>
            )}
            {results.length > 0 && (
              <>
                <ul className="-mx-1 flex max-h-72 flex-col overflow-y-auto">
                  {results.map((r) => (
                    <li key={r.url}>
                      <label className="flex items-center gap-3 rounded-xl p-2 hover:bg-muted/60">
                        <SourceIcon source={{ kind: "url", url: r.url }} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm">
                            {r.title}
                          </span>
                          <span className="block truncate font-mono text-[11px] text-muted-foreground">
                            {new URL(r.url).hostname}
                          </span>
                        </span>
                        <Checkbox
                          checked={picked.includes(r.url)}
                          onCheckedChange={(checked) =>
                            setPicked((p) =>
                              checked
                                ? [...p, r.url]
                                : p.filter((u) => u !== r.url)
                            )
                          }
                        />
                      </label>
                    </li>
                  ))}
                </ul>
                <Button
                  disabled={pending || picked.length === 0}
                  onClick={() =>
                    run(async () => {
                      const failed: string[] = []
                      for (const url of picked)
                        if ((await addUrlSource(notebookId, url)).error)
                          failed.push(url)
                      setResults([])
                      if (failed.length)
                        return {
                          error: `${failed.length} Quelle(n) konnten nicht importiert werden`,
                        }
                      return finish({})
                    }, `${picked.length} Quellen importiert`)
                  }
                >
                  {pending && <Spinner />} {picked.length}{" "}
                  {picked.length === 1 ? "Quelle" : "Quellen"} importieren
                </Button>
              </>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

type Details = {
  id: string
  content: string
  fileUrl: string | null
  summary: string | null
}

export function SourceViewer({
  notebookId,
  target,
  canEdit,
  onClose,
}: {
  notebookId: string
  target: SourceTarget | null
  canEdit: boolean
  onClose: () => void
}) {
  const [details, setDetails] = useState<Details | null>(null)
  const [summarizing, setSummarizing] = useState(false)
  const markRef = useRef<HTMLElement>(null)
  const sourceId = target?.source.id

  useEffect(() => {
    if (!sourceId) return
    let active = true
    sourceDetails(notebookId, sourceId).then(async (d) => {
      if (!active || d.error !== undefined) return
      setDetails({
        id: sourceId,
        content: d.content,
        fileUrl: d.fileUrl,
        summary: d.summary,
      })
      if (d.summary || !canEdit) return
      setSummarizing(true)
      const result = await ensureSourceSummary(notebookId, sourceId)
      if (!active) return
      setSummarizing(false)
      const summary = result.summary
      if (summary)
        setDetails((cur) => (cur?.id === sourceId ? { ...cur, summary } : cur))
    })
    return () => {
      active = false
    }
  }, [notebookId, sourceId, canEdit])

  const loaded = details && details.id === sourceId ? details : null
  const cited = target?.citation?.cited_text.trim()
  const content = loaded?.content ?? ""
  const hit = cited ? content.indexOf(cited) : -1
  const page = target?.citation?.page

  useEffect(() => {
    if (hit >= 0)
      setTimeout(
        () =>
          markRef.current?.scrollIntoView({
            block: "center",
            behavior: "smooth",
          }),
        250
      )
  }, [hit, sourceId])

  const source = target?.source
  return (
    <Sheet open={!!target} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full gap-0 sm:max-w-2xl">
        {source && (
          <>
            <div className="border-b px-6 pt-6 pb-5">
              <div className="flex items-center gap-3 pr-8">
                <SourceIcon source={source} />
                <span className="label">
                  {KIND_LABEL[source.kind]} ·{" "}
                  {new Date(source.created_at).toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" })}
                </span>
              </div>
              <SheetTitle className="mt-4 font-serif text-3xl leading-tight font-normal">
                {source.title}
              </SheetTitle>
              {source.url && (
                <a
                  href={source.url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex max-w-full items-center gap-1 truncate font-mono text-xs text-muted-foreground hover:text-foreground"
                >
                  {source.url.replace(/^https?:\/\//, "")}{" "}
                  <ArrowUpRightIcon className="size-3 shrink-0" />
                </a>
              )}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
              {(loaded?.summary || summarizing) && (
                <section className="mb-8 rounded-2xl bg-muted/60 p-5">
                  <p className="label flex items-center gap-1.5">
                    <SparklesIcon className="size-3" /> Quellenübersicht
                  </p>
                  {loaded?.summary ? (
                    <Markdown className="mt-2 text-sm">
                      {loaded.summary}
                    </Markdown>
                  ) : (
                    <div className="mt-3 flex flex-col gap-2">
                      <div className="wash h-3 w-full rounded-full" />
                      <div className="wash h-3 w-11/12 rounded-full" />
                      <div className="wash h-3 w-2/3 rounded-full" />
                    </div>
                  )}
                </section>
              )}
              {cited && (hit < 0 || loaded?.fileUrl) && (
                <blockquote className="mb-6 border-l-2 border-signal pl-4 text-sm leading-relaxed">
                  {page && (
                    <span className="label mb-1 block">Seite {page}</span>
                  )}
                  <span className="marker">{cited}</span>
                </blockquote>
              )}
              {!loaded ? (
                <div className="flex flex-col gap-2.5">
                  {Array.from({ length: 8 }, (_, i) => (
                    <div
                      key={i}
                      className="wash h-3 rounded-full"
                      style={{ width: `${70 + ((i * 37) % 30)}%` }}
                    />
                  ))}
                </div>
              ) : loaded.fileUrl ? (
                <iframe
                  src={`${loaded.fileUrl}${page ? `#page=${page}` : ""}`}
                  title={source.title}
                  className="h-[70svh] w-full rounded-xl border bg-white"
                />
              ) : (
                <div className="font-serif text-lg leading-[1.75] whitespace-pre-wrap">
                  {hit >= 0 && cited ? (
                    <>
                      <span className="text-foreground/55">
                        {content.slice(0, hit)}
                      </span>
                      <mark
                        ref={markRef}
                        className="marker bg-transparent text-foreground"
                      >
                        {cited}
                      </mark>
                      <span className="text-foreground/55">
                        {content.slice(hit + cited.length)}
                      </span>
                    </>
                  ) : (
                    content
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
