"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useRef, useState } from "react"
import { motion } from "motion/react"
import {
  ArrowLeftIcon,
  CheckIcon,
  CopyIcon,
  GlobeIcon,
  MoreHorizontalIcon,
  SlidersHorizontalIcon,
  Trash2Icon,
  UserPlusIcon,
  XIcon,
} from "lucide-react"
import { deleteNotebook, duplicateNotebook, inviteMember, removeMember, updateNotebook } from "@/app/notebook/actions"
import { Cover } from "@/components/notebook/brand"
import { ChatPanel, type ChatHandle } from "@/components/notebook/chat-panel"
import { AddSourceDialog, SourceViewer, SourcesPanel, type SourceTarget } from "@/components/notebook/sources-panel"
import { StudioPanel } from "@/components/notebook/studio-panel"
import { useLiveNotes } from "@/components/notebook/use-live-notes"
import { useRun } from "@/components/notebook/use-run"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { SPRING_LAYOUT } from "@/lib/ease"
import type { Member, Message, Note, Notebook, Role, Source } from "@/lib/types"
import { cn } from "@/lib/utils"

const enter = (i: number) => ({
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  transition: { ...SPRING_LAYOUT, delay: 0.04 + i * 0.06 },
})

const TABS = [
  ["sources", "Quellen"],
  ["chat", "Chat"],
  ["studio", "Studio"],
] as const

type Tab = (typeof TABS)[number][0]

export function NotebookView({
  notebook,
  role,
  sources,
  notes,
  messages,
  members,
}: {
  notebook: Notebook
  role: Role
  sources: Source[]
  notes: Note[]
  messages: Message[]
  members: Member[]
}) {
  const canEdit = role !== "viewer"
  const [tab, setTab] = useState<Tab>("chat")
  const [viewing, setViewing] = useState<SourceTarget | null>(null)
  const [dialog, setDialog] = useState<"share" | "settings" | "add" | null>(null)
  const [collapsed, setCollapsed] = useState({ sources: false, studio: false })
  const chat = useRef<ChatHandle>(null)
  const [, run] = useRun()
  const [copying, runCopy] = useRun()
  const duplicate = () => runCopy(() => duplicateNotebook(notebook.id))
  const router = useRouter()
  useLiveNotes(notebook.id, notes.some((n) => n.status === "pending"))

  const panel = (name: Tab) =>
    cn(
      "min-h-0 flex-col overflow-hidden rounded-2xl bg-card shadow-[0_1px_2px_oklch(0_0_0/0.04),0_0_0_1px_oklch(0_0_0/0.05)] lg:flex dark:shadow-[0_0_0_1px_oklch(1_0_0/0.07)]",
      tab === name ? "flex" : "hidden"
    )
  const toggle = (name: "sources" | "studio") => setCollapsed((c) => ({ ...c, [name]: !c[name] }))

  return (
    <div className="flex h-svh flex-col">
      <header className="flex h-14 shrink-0 items-center gap-3 px-3 lg:px-4">
        <Button variant="ghost" size="icon" render={<Link href="/" />} nativeButton={false} aria-label="Alle Notebooks">
          <ArrowLeftIcon />
        </Button>
        <Cover seed={notebook.id} className="size-7 shrink-0 rounded-lg" />
        <input
          key={notebook.title}
          defaultValue={notebook.title}
          readOnly={!canEdit}
          aria-label="Titel des Notebooks"
          className="min-w-0 flex-1 truncate rounded-md bg-transparent px-1 font-serif text-2xl tracking-tight outline-none read-only:cursor-default hover:enabled:read-write:bg-muted/60 focus-visible:bg-muted/60"
          onBlur={(e) => {
            const title = e.currentTarget.value.trim()
            if (canEdit && title && title !== notebook.title) run(() => updateNotebook(notebook.id, { title }))
          }}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        />
        {role !== "owner" && <span className="label hidden sm:block">{role === "editor" ? "Bearbeiter" : "Nur lesen"}</span>}
        {role === "viewer" && (
          <Button variant="outline" className="rounded-full" disabled={copying} onClick={duplicate}>
            <CopyIcon /> {copying ? "Wird kopiert …" : "Eigene Kopie"}
          </Button>
        )}
        {role === "owner" && (
          <Button variant="outline" className="rounded-full" onClick={() => setDialog("share")}>
            {notebook.is_public ? <GlobeIcon /> : <UserPlusIcon />} Teilen
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label="Mehr Optionen" />}>
            <MoreHorizontalIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem disabled={!canEdit} onClick={() => setDialog("settings")}>
              <SlidersHorizontalIcon /> Chat anpassen
            </DropdownMenuItem>
            <DropdownMenuItem disabled={copying} onClick={duplicate}>
              <CopyIcon /> Duplizieren
            </DropdownMenuItem>
            {role === "owner" && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => {
                    if (!confirm(`„${notebook.title}“ mit allen Quellen und Notizen löschen?`)) return
                    run(async () => {
                      const result = await deleteNotebook(notebook.id)
                      if (!result.error) router.push("/")
                      return result
                    })
                  }}
                >
                  <Trash2Icon /> Notebook löschen
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <nav className="mx-3 mb-2 grid grid-cols-3 gap-1 rounded-full bg-muted p-1 lg:hidden" aria-label="Bereiche">
        {TABS.map(([value, label]) => (
          <button
            key={value}
            onClick={() => setTab(value)}
            aria-current={tab === value}
            className={cn("relative rounded-full py-1.5 text-sm text-muted-foreground transition-colors", tab === value && "text-foreground")}
          >
            {tab === value && (
              <motion.span layoutId="notebook-tab" transition={SPRING_LAYOUT} className="absolute inset-0 rounded-full bg-card shadow-sm" />
            )}
            <span className="relative">{label}</span>
          </button>
        ))}
      </nav>

      <main
        className="grid min-h-0 flex-1 gap-2 px-2 pb-2 transition-[grid-template-columns] duration-300 ease-out lg:grid-cols-(--cols)"
        style={
          {
            "--cols": `${collapsed.sources ? "52px" : "minmax(260px,0.9fr)"} minmax(0,2fr) ${collapsed.studio ? "52px" : "minmax(300px,1fr)"}`,
          } as React.CSSProperties
        }
      >
        <motion.section {...enter(0)} className={panel("sources")} aria-label="Quellen">
          <SourcesPanel
            notebookId={notebook.id}
            sources={sources}
            canEdit={canEdit}
            collapsed={collapsed.sources}
            onToggle={() => toggle("sources")}
            onAdd={() => setDialog("add")}
            onOpen={setViewing}
          />
        </motion.section>
        <motion.section {...enter(1)} className={panel("chat")} aria-label="Chat">
          <ChatPanel
            notebook={notebook}
            initialMessages={messages}
            sources={sources}
            canEdit={canEdit}
            onAddSource={() => setDialog("add")}
            onCite={(citation) => {
              const source = sources.find((s) => s.id === citation.source_id)
              if (source) setViewing({ source, citation })
            }}
            ref={chat}
          />
        </motion.section>
        <motion.section {...enter(2)} className={panel("studio")} aria-label="Studio">
          <StudioPanel
            notebookId={notebook.id}
            notes={notes}
            canEdit={canEdit}
            hasSources={sources.some((s) => s.selected)}
            collapsed={collapsed.studio}
            onToggle={() => toggle("studio")}
            onAsk={(text) => {
              chat.current?.ask(text)
              setTab("chat")
            }}
          />
        </motion.section>
      </main>

      <SourceViewer notebookId={notebook.id} target={viewing} canEdit={canEdit} onClose={() => setViewing(null)} />
      <AddSourceDialog notebookId={notebook.id} open={dialog === "add"} onClose={() => setDialog(null)} />
      <ShareDialog open={dialog === "share"} onClose={() => setDialog(null)} notebook={notebook} members={members} />
      <SettingsDialog open={dialog === "settings"} onClose={() => setDialog(null)} notebook={notebook} />
    </div>
  )
}

function ShareDialog({
  open,
  onClose,
  notebook,
  members,
}: {
  open: boolean
  onClose: () => void
  notebook: Notebook
  members: Member[]
}) {
  const [email, setEmail] = useState("")
  const [role, setRole] = useState<"viewer" | "editor">("viewer")
  const [copied, setCopied] = useState(false)
  const [pending, run] = useRun()
  const link = typeof window === "undefined" ? "" : `${window.location.origin}/notebook/${notebook.id}`

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="gap-6 p-6 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif text-3xl font-normal">Teilen</DialogTitle>
          <DialogDescription>Lade Personen mit Konto ein oder gib das Notebook per Link frei.</DialogDescription>
        </DialogHeader>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            run(async () => {
              const result = await inviteMember(notebook.id, email, role)
              if (!result.error) setEmail("")
              return result
            }, `${email} eingeladen`)
          }}
        >
          <Input
            type="email"
            required
            placeholder="name@beispiel.de"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-label="E-Mail der Person"
          />
          <NativeSelect value={role} onChange={(e) => setRole(e.target.value as "viewer" | "editor")} aria-label="Rolle">
            <NativeSelectOption value="viewer">Lesen</NativeSelectOption>
            <NativeSelectOption value="editor">Bearbeiten</NativeSelectOption>
          </NativeSelect>
          <Button type="submit" disabled={pending}>
            Einladen
          </Button>
        </form>
        {members.length > 0 && (
          <ul className="-my-2 flex flex-col">
            {members.map((m) => (
              <li key={m.user_id} className="flex items-center gap-3 py-2 text-sm">
                <span className="flex size-7 items-center justify-center rounded-full bg-muted font-serif italic">
                  {m.email[0]?.toUpperCase()}
                </span>
                <span className="min-w-0 flex-1 truncate">{m.email}</span>
                <span className="label">{m.role === "editor" ? "Bearbeiten" : "Lesen"}</span>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`${m.email} entfernen`}
                  onClick={() => run(() => removeMember(notebook.id, m.user_id))}
                >
                  <XIcon />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <div className="rounded-xl bg-muted/60 p-4">
          <label className="flex items-center justify-between gap-4 text-sm">
            <span>
              <span className="flex items-center gap-1.5 font-medium">
                <GlobeIcon className="size-4" /> Freigabe per Link
              </span>
              <span className="mt-0.5 block text-muted-foreground">Alle Angemeldeten mit dem Link können lesen und fragen.</span>
            </span>
            <Switch
              checked={notebook.is_public}
              onCheckedChange={(checked) => run(() => updateNotebook(notebook.id, { is_public: checked }))}
            />
          </label>
          {notebook.is_public && (
            <div className="mt-3 flex gap-2">
              <Input readOnly value={link} aria-label="Freigabelink" className="bg-card font-mono text-xs" />
              <Button
                variant="outline"
                className="bg-card"
                onClick={() => {
                  navigator.clipboard.writeText(link)
                  setCopied(true)
                  setTimeout(() => setCopied(false), 1600)
                }}
              >
                {copied ? <CheckIcon /> : <CopyIcon />} {copied ? "Kopiert" : "Kopieren"}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

const PRESETS = [
  "Antworte knapp in wenigen Sätzen.",
  "Erkläre wie für Einsteiger, ohne Fachjargon.",
  "Antworte als kritischer Gutachter und nenne Schwächen.",
]

function SettingsDialog({ open, onClose, notebook }: { open: boolean; onClose: () => void; notebook: Notebook }) {
  const [pending, run] = useRun()
  const [value, setValue] = useState(notebook.instructions)
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="gap-5 p-6 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-serif text-3xl font-normal">Chat anpassen</DialogTitle>
          <DialogDescription>Rolle, Stil oder Länge der Antworten für dieses Notebook.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setValue(preset)}
              className="rounded-full border px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
            >
              {preset}
            </button>
          ))}
        </div>
        <Textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          rows={6}
          maxLength={4000}
          placeholder="z. B. Antworte als Lehrkraft für die 10. Klasse."
          aria-label="Anweisungen"
        />
        <DialogFooter>
          <Button
            disabled={pending}
            onClick={() =>
              run(async () => {
                const result = await updateNotebook(notebook.id, { instructions: value })
                if (!result.error) onClose()
                return result
              }, "Gespeichert")
            }
          >
            Speichern
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
