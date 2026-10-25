"use client"

import { useEffect, useRef, useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import {
  ArrowRightIcon,
  BookmarkPlusIcon,
  CheckIcon,
  CopyIcon,
  PlusIcon,
  RotateCcwIcon,
} from "lucide-react"
import { clearChat, ensureGuide, saveNote } from "@/app/notebook/actions"
import { PromptInput } from "@/components/agents/prompt-input"
import { Markdown } from "@/components/notebook/markdown"
import { SourceIcon } from "@/components/notebook/sources-panel"
import { useRun } from "@/components/notebook/use-run"
import { Button } from "@/components/ui/button"
import { toast } from "@/components/ui/toast"
import { readEvents } from "@/lib/chat"
import { withCitationMarkers } from "@/lib/citations"
import { SPRING_LAYOUT, SPRING_SWAP } from "@/lib/ease"
import type { Citation, Message, Notebook, Source } from "@/lib/types"

export function ChatPanel({
  notebook,
  initialMessages,
  sources,
  canEdit,
  onAddSource,
  onCite,
}: {
  notebook: Notebook
  initialMessages: Message[]
  sources: Source[]
  canEdit: boolean
  onAddSource: () => void
  onCite: (citation: Citation) => void
}) {
  const [messages, setMessages] = useState(initialMessages)
  const [input, setInput] = useState("")
  const [streaming, setStreaming] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [, run] = useRun()
  const active = sources.filter((s) => s.selected)

  useEffect(() => {
    const el = scrollRef.current
    if (el)
      el.scrollTo({
        top: el.scrollHeight,
        behavior: streaming ? "auto" : "smooth",
      })
  }, [messages, streaming])

  const send = async (text: string) => {
    const question = text.trim()
    if (!question || streaming || !active.length) return
    setInput("")
    const now = new Date().toISOString()
    setMessages((m) => [
      ...m,
      {
        id: crypto.randomUUID(),
        role: "user",
        content: question,
        citations: [],
        created_at: now,
      },
      {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "",
        citations: [],
        created_at: now,
      },
    ])
    const update = (fn: (m: Message) => Message) =>
      setMessages((all) => [...all.slice(0, -1), fn(all[all.length - 1])])

    setStreaming(true)
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const res = await fetch(`/api/notebooks/${notebook.id}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: question }),
        signal: controller.signal,
      })
      if (!res.ok || !res.body) {
        const { error } = await res
          .json()
          .catch(() => ({ error: "Anfrage fehlgeschlagen" }))
        throw new Error(error)
      }
      for await (const event of readEvents(res.body)) {
        if (event.type === "text")
          update((m) => ({ ...m, content: m.content + event.text }))
        else if (event.type === "citation")
          update((m) => ({ ...m, citations: [...m.citations, event.citation] }))
        else if (event.type === "replace")
          update((m) => ({ ...m, content: event.text, citations: [] }))
        else if (event.type === "error") throw new Error(event.error)
      }
    } catch (e) {
      if (!controller.signal.aborted)
        toast.add({ title: (e as Error).message, type: "error" })
      setMessages((all) =>
        all[all.length - 1].content ? all : all.slice(0, -1)
      )
    } finally {
      setStreaming(false)
      abortRef.current = null
    }
  }

  return (
    <>
      <div className="flex h-12 shrink-0 items-center justify-between border-b px-4">
        <h2 className="label">Chat</h2>
        {messages.length > 0 && (
          <Button
            size="sm"
            variant="ghost"
            className="text-muted-foreground"
            disabled={streaming}
            onClick={() =>
              confirm("Gesprächsverlauf löschen?") &&
              run(async () => {
                const result = await clearChat(notebook.id)
                if (!result.error) setMessages([])
                return result
              })
            }
          >
            <RotateCcwIcon /> Neues Gespräch
          </Button>
        )}
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex min-h-full max-w-[44rem] flex-col px-5 py-8 lg:px-8">
          {messages.length === 0 ? (
            sources.length === 0 ? (
              <EmptyNotebook canEdit={canEdit} onAddSource={onAddSource} />
            ) : (
              <Overview
                notebook={notebook}
                sources={active}
                canEdit={canEdit}
                onAsk={send}
              />
            )
          ) : (
            <div className="flex flex-col gap-10">
              {messages.map((m, i) =>
                m.role === "user" ? (
                  <motion.div
                    key={m.id}
                    initial={{ opacity: 0, y: 12, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={SPRING_LAYOUT}
                    className="ml-auto max-w-[85%] origin-bottom-right rounded-2xl rounded-br-md bg-muted px-4 py-2.5 text-[15px] whitespace-pre-wrap"
                  >
                    {m.content}
                  </motion.div>
                ) : (
                  <Answer
                    key={m.id}
                    message={m}
                    sources={sources}
                    pending={streaming && i === messages.length - 1}
                    activeCount={active.length}
                    canEdit={canEdit}
                    onCite={onCite}
                    onSave={() =>
                      run(
                        () =>
                          saveNote(notebook.id, {
                            title:
                              messages[i - 1]?.content.slice(0, 80) ??
                              "Antwort",
                            content: m.content,
                          }),
                        "Als Notiz gespeichert"
                      )
                    }
                  />
                )
              )}
            </div>
          )}
        </div>
      </div>

      <div className="mx-auto w-full max-w-[46rem] px-3 pb-3">
        <PromptInput
          value={input}
          onValueChange={setInput}
          onSubmit={send}
          loading={streaming}
          onStop={() => abortRef.current?.abort()}
          disabled={!active.length}
          minRows={1}
          placeholder={
            active.length
              ? "Frag deine Quellen …"
              : "Wähle links mindestens eine Quelle"
          }
          aria-label="Frage"
        />
        <p className="mt-2 text-center text-[11px] text-muted-foreground">
          Antworten stützen sich nur auf {active.length}{" "}
          {active.length === 1 ? "ausgewählte Quelle" : "ausgewählte Quellen"}.
        </p>
      </div>
    </>
  )
}

function Answer({
  message,
  sources,
  pending,
  activeCount,
  canEdit,
  onCite,
  onSave,
}: {
  message: Message
  sources: Source[]
  pending: boolean
  activeCount: number
  canEdit: boolean
  onCite: (citation: Citation) => void
  onSave: () => void
}) {
  const [copied, setCopied] = useState(false)
  const cited = [...new Set(message.citations.map((c) => c.source_id))]
    .map((id) => sources.find((s) => s.id === id))
    .filter((s): s is Source => !!s)

  if (!message.content)
    return (
      <p className="shimmer-text text-[15px]">
        Liest {activeCount} {activeCount === 1 ? "Quelle" : "Quellen"} …
      </p>
    )

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING_LAYOUT}
      className="group flex flex-col gap-4"
    >
      <Markdown citations={message.citations} onCite={onCite}>
        {withCitationMarkers(message.content, message.citations)}
      </Markdown>
      {!pending && (
        <div className="flex flex-wrap items-center gap-1.5">
          {cited.map((s, i) => (
            <motion.button
              key={s.id}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ ...SPRING_SWAP, delay: i * 0.05 }}
              onClick={() =>
                onCite(message.citations.find((c) => c.source_id === s.id)!)
              }
              className="flex max-w-56 items-center gap-1.5 rounded-full border py-0.5 pr-2.5 pl-0.5 text-xs text-muted-foreground transition-colors hover:border-foreground/25 hover:text-foreground"
            >
              <SourceIcon
                source={s}
                className="size-5 rounded-full [&_img]:size-3 [&_svg]:size-3"
              />
              <span className="truncate">{s.title}</span>
            </motion.button>
          ))}
          <span className="flex-1" />
          <div className="flex gap-0.5 opacity-60 transition-opacity group-hover:opacity-100">
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Antwort kopieren"
              onClick={() => {
                navigator.clipboard.writeText(message.content)
                setCopied(true)
                setTimeout(() => setCopied(false), 1500)
              }}
            >
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={copied ? "done" : "copy"}
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.5, opacity: 0 }}
                  transition={SPRING_SWAP}
                >
                  {copied ? <CheckIcon /> : <CopyIcon />}
                </motion.span>
              </AnimatePresence>
            </Button>
            {canEdit && (
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label="Als Notiz speichern"
                onClick={onSave}
              >
                <BookmarkPlusIcon />
              </Button>
            )}
          </div>
        </div>
      )}
    </motion.div>
  )
}

function EmptyNotebook({
  canEdit,
  onAddSource,
}: {
  canEdit: boolean
  onAddSource: () => void
}) {
  return (
    <div className="rise my-auto flex flex-col items-start py-12">
      <p className="label">Schritt 1 von 2</p>
      <h3 className="mt-4 font-serif text-[clamp(2.5rem,5vw,4rem)] leading-[0.95] tracking-tight">
        Beginne mit
        <br />
        <span className="italic">einer Quelle.</span>
      </h3>
      <p className="mt-5 max-w-sm text-muted-foreground">
        PDFs, Webseiten oder eigene Texte. Danach beantwortet Folio deine Fragen
        mit Belegen aus genau diesen Quellen.
      </p>
      {canEdit && (
        <Button
          size="lg"
          className="mt-8 h-11 rounded-full px-5"
          onClick={onAddSource}
        >
          <PlusIcon /> Quelle hinzufügen
        </Button>
      )}
    </div>
  )
}

const item = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: SPRING_LAYOUT },
}

function Overview({
  notebook,
  sources,
  canEdit,
  onAsk,
}: {
  notebook: Notebook
  sources: Source[]
  canEdit: boolean
  onAsk: (question: string) => void
}) {
  const key = sources.map((s) => s.id).join()
  const [fetched, setFetched] = useState<{
    key: string
    guide: Notebook["guide"]
  } | null>(null)
  const current = fetched?.key === key ? fetched : null
  const guide = notebook.guide ?? current?.guide ?? null
  const failed = !!current && !current.guide

  useEffect(() => {
    if (notebook.guide || !canEdit || !key) return
    let active = true
    ensureGuide(notebook.id).then((result) => {
      if (active) setFetched({ key, guide: result.guide ?? null })
    })
    return () => {
      active = false
    }
  }, [notebook.id, notebook.guide, canEdit, key])

  return (
    <div className="rise flex flex-col">
      <p className="label">
        Überblick · {sources.length}{" "}
        {sources.length === 1 ? "Quelle" : "Quellen"}
      </p>
      <h3 className="mt-4 font-serif text-[clamp(2.25rem,4.5vw,3.5rem)] leading-[0.98] tracking-tight">
        {notebook.title}
      </h3>

      <AnimatePresence mode="wait" initial={false}>
        {guide ? (
          <motion.div
            key="guide"
            initial="hidden"
            animate="show"
            variants={{ show: { transition: { staggerChildren: 0.05 } } }}
          >
            <motion.p
              variants={item}
              className="mt-5 text-[15px] leading-relaxed text-foreground/80"
            >
              {guide.summary}
            </motion.p>
            {guide.topics.length > 0 && (
              <div className="mt-5 flex flex-wrap gap-1.5">
                {guide.topics.map((topic) => (
                  <motion.button
                    key={topic}
                    variants={item}
                    whileTap={{ scale: 0.95 }}
                    onClick={() =>
                      onAsk(
                        `Erkläre mir das Thema „${topic}“ anhand der Quellen.`
                      )
                    }
                    className="rounded-full bg-muted px-3 py-1 text-xs transition-colors hover:bg-foreground hover:text-background"
                  >
                    {topic}
                  </motion.button>
                ))}
              </div>
            )}
            <motion.p variants={item} className="label mt-10 mb-2">
              Frag zum Beispiel
            </motion.p>
            <ul className="flex flex-col border-t">
              {guide.questions.map((q) => (
                <motion.li key={q} variants={item} className="border-b">
                  <button
                    onClick={() => onAsk(q)}
                    className="group flex w-full items-center gap-4 py-4 text-left font-serif text-xl leading-snug transition-colors hover:text-signal"
                  >
                    <span className="flex-1">{q}</span>
                    <ArrowRightIcon className="size-4 shrink-0 -translate-x-1 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
                  </button>
                </motion.li>
              ))}
            </ul>
          </motion.div>
        ) : canEdit && !failed ? (
          <motion.div
            key="loading"
            exit={{ opacity: 0, transition: { duration: 0.15 } }}
            className="mt-6 flex flex-col gap-2.5"
            aria-label="Überblick wird erstellt"
          >
            <div className="wash h-3.5 w-full rounded-full" />
            <div className="wash h-3.5 w-11/12 rounded-full" />
            <div className="wash h-3.5 w-3/5 rounded-full" />
            <p className="shimmer-text mt-3 text-sm">
              Folio liest deine Quellen und erstellt einen Überblick …
            </p>
          </motion.div>
        ) : (
          <motion.p
            key="fallback"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-5 text-muted-foreground"
          >
            Stell unten eine Frage. Jede Antwort verweist auf die passende
            Stelle.
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  )
}
