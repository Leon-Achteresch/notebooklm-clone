"use server"

import { randomUUID } from "node:crypto"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { after } from "next/server"
import { z } from "zod"
import { throttle } from "@/lib/rate-limit"
import { action, clientIp, must, UserError, userMessage } from "@/lib/server/action"
import {
  answerListener,
  chargeQuota,
  discoverSources,
  fetchUrl,
  generateGuide,
  generateStudio,
  summarizeSource,
} from "@/lib/server/ai"
import { audioTrackSchema, speakable, type AudioTrack } from "@/lib/audio"
import { claimTts, PODCAST_MODEL, synthesize } from "@/lib/server/tts"
import {
  HOSTS,
  LANGUAGES,
  parseStudioData,
  studioLabel,
  studioRequestSchema,
  type AudioScript,
  type Language,
  type StudioRequest,
} from "@/lib/studio"
import { createClient, type Db } from "@/lib/supabase/server"
import type { Guide } from "@/lib/types"

const MAX_TEXT = 2_000_000
const MAX_PDF = 30 * 1024 * 1024

const id = z.uuid()
const title = z.string().trim().max(300)
const text = z.string().trim().min(1, "Der Text ist leer").max(MAX_TEXT, "Der Text ist zu lang")

async function editor(notebookId: string) {
  const db = await createClient()
  if (!must(await db.rpc("can_edit_notebook", { nid: notebookId })))
    throw new UserError("Keine Bearbeitungsrechte für dieses Notebook")
  return db
}

function refresh(notebookId: string) {
  revalidatePath(`/notebook/${notebookId}`)
}

async function limitUploads() {
  const wait = throttle(["upload", await clientIp()])
  if (wait) throw new UserError(wait)
}

async function selectedSources(db: Db, notebookId: string) {
  const sources = must(
    await db.from("sources").select("*").eq("notebook_id", notebookId).eq("selected", true).order("created_at")
  )
  if (!sources.length) throw new UserError("Wähle mindestens eine Quelle aus")
  return sources
}

async function uploadPdf(db: Db, notebookId: string, body: Blob | Buffer) {
  const path = `${notebookId}/${randomUUID()}.pdf`
  const { error } = await db.storage.from("sources").upload(path, body, { contentType: "application/pdf" })
  if (error) throw error
  return path
}

async function settled<T>(tasks: Promise<T>[]) {
  return (await Promise.allSettled(tasks)).map((r) => {
    if (r.status === "rejected") throw r.reason
    return r.value
  })
}

async function purge(db: Db, notebookId: string) {
  await Promise.all(
    (["sources", "studio"] as const).map(async (bucket) => {
      const listed = await db.storage.from(bucket).list(notebookId, { limit: 10000 })
      if (listed.error) throw listed.error
      const names = listed.data.map((f) => `${notebookId}/${f.name}`)
      if (!names.length) return
      const { error } = await db.storage.from(bucket).remove(names)
      if (error) throw error
    })
  )
  must(await db.from("notebooks").delete().eq("id", notebookId).select("id").single())
}

export async function createNotebook() {
  const db = await createClient()
  const notebook = must(await db.from("notebooks").insert({}).select("id").single())
  redirect(`/notebook/${notebook.id}`)
}

export const deleteNotebook = action([id], async (notebookId) => {
  const db = await createClient()
  if (must(await db.rpc("notebook_role", { nid: notebookId })) !== "owner") throw new UserError("Dafür fehlen dir die Rechte")
  await purge(db, notebookId)
  revalidatePath("/")
})

export const duplicateNotebook = action([id], async (notebookId) => {
  await limitUploads()
  const db = await createClient()
  const original = must(await db.from("notebooks").select("title, instructions, guide").eq("id", notebookId).single())
  const [sourcesResult, notesResult] = await Promise.all([
    db.from("sources").select("*").eq("notebook_id", notebookId).order("created_at"),
    db.from("notes").select("*").eq("notebook_id", notebookId).eq("status", "ready").order("created_at"),
  ])
  const sources = must(sourcesResult)
  const notes = must(notesResult)
  const copy = must(
    await db
      .from("notebooks")
      .insert({ title: `${original.title} (Kopie)`, instructions: original.instructions })
      .select("id")
      .single()
  )
  try {
    const copyFile = async (bucket: "sources" | "studio", from: string, to: string) => {
      const { error } = await db.storage.from(bucket).copy(from, to)
      if (error) throw error
      return to
    }
    const sourceRows = await settled(
      sources.map(async (s) => ({
        notebook_id: copy.id,
        kind: s.kind,
        title: s.title,
        content: s.content,
        url: s.url,
        selected: s.selected,
        summary: s.summary,
        storage_path: s.storage_path && (await copyFile("sources", s.storage_path, `${copy.id}/${randomUUID()}.pdf`)),
      }))
    )
    const noteRows = await settled(
      notes.map(async (n) => {
        const noteId = randomUUID()
        const track = audioTrackSchema.safeParse((n.data as { audio?: unknown } | null)?.audio)
        const data = track.success
          ? { ...(n.data as object), audio: { ...track.data, path: await copyFile("studio", track.data.path, `${copy.id}/${noteId}.mp3`) } }
          : n.data
        return { id: noteId, notebook_id: copy.id, kind: n.kind, title: n.title, content: n.content, data, status: n.status, created_at: n.created_at }
      })
    )
    if (sourceRows.length) must(await db.from("sources").insert(sourceRows))
    if (noteRows.length) must(await db.from("notes").insert(noteRows))
    if (original.guide) must(await db.from("notebooks").update({ guide: original.guide }).eq("id", copy.id))
  } catch (e) {
    await purge(db, copy.id).catch(() => {})
    throw e
  }
  revalidatePath("/")
  redirect(`/notebook/${copy.id}`)
})

export const updateNotebook = action(
  [id, z.object({ title: title.min(1).optional(), instructions: z.string().max(4000).optional(), is_public: z.boolean().optional() })],
  async (notebookId, patch) => {
    const db = await createClient()
    must(await db.from("notebooks").update(patch).eq("id", notebookId).select("id").single())
    revalidatePath("/")
    refresh(notebookId)
  }
)

export const inviteMember = action([id, z.email("Ungültige E-Mail"), z.enum(["viewer", "editor"])], async (notebookId, email, role) => {
  const db = await createClient()
  must(await db.rpc("invite_member", { nid: notebookId, member_email: email, member_role: role }))
  refresh(notebookId)
})

export const removeMember = action([id, id], async (notebookId, userId) => {
  const db = await createClient()
  must(await db.from("notebook_members").delete().eq("notebook_id", notebookId).eq("user_id", userId))
  refresh(notebookId)
})

export const addTextSource = action([id, title, text], async (notebookId, name, content) => {
  await limitUploads()
  const db = await editor(notebookId)
  must(await db.from("sources").insert({ notebook_id: notebookId, kind: "text", title: name || content.slice(0, 60), content }))
  refresh(notebookId)
})

export const addFileSource = action([id, z.instanceof(FormData)], async (notebookId, form) => {
  const file = form.get("file")
  if (!(file instanceof File) || file.size === 0) throw new UserError("Keine Datei ausgewählt")
  await limitUploads()
  const name = file.name.replace(/\.[^.]+$/, "")
  const db = await editor(notebookId)

  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    if (file.size > MAX_PDF) throw new UserError("PDFs dürfen höchstens 30 MB groß sein")
    const storage_path = await uploadPdf(db, notebookId, file)
    must(await db.from("sources").insert({ notebook_id: notebookId, kind: "pdf", title: name, storage_path }))
  } else {
    if (file.size > MAX_TEXT) throw new UserError("Die Datei ist zu groß")
    const content = (await file.text()).trim()
    if (!content || content.includes("\u0000")) throw new UserError("Nur PDF- und Textdateien (.txt, .md, .csv …) werden unterstützt")
    must(await db.from("sources").insert({ notebook_id: notebookId, kind: "text", title: name, content }))
  }
  refresh(notebookId)
})

export const addUrlSource = action(
  [id, z.url({ protocol: /^https?$/, error: "Ungültiger Link" })],
  async (notebookId, url) => {
    const db = await editor(notebookId)
    await chargeQuota(db)
    const page = await fetchUrl(url)
    if (page.source.type === "base64") {
      const storage_path = await uploadPdf(db, notebookId, Buffer.from(page.source.data, "base64"))
      must(await db.from("sources").insert({ notebook_id: notebookId, kind: "pdf", title: page.title, url, storage_path }))
    } else {
      const content = page.source.data.trim().slice(0, MAX_TEXT)
      if (!content) throw new UserError("Auf der Seite wurde kein Text gefunden")
      must(await db.from("sources").insert({ notebook_id: notebookId, kind: "url", title: page.title, url, content }))
    }
    refresh(notebookId)
  }
)

export const discover = action([id, z.string().trim().min(1, "Bitte ein Thema eingeben").max(200)], async (notebookId, topic) => {
  const db = await editor(notebookId)
  await chargeQuota(db)
  return { results: await discoverSources(topic) }
})

export const updateSource = action(
  [id, z.array(id).min(1).max(500), z.object({ selected: z.boolean().optional(), title: title.min(1).optional() })],
  async (notebookId, sourceIds, patch) => {
    const db = await editor(notebookId)
    must(await db.from("sources").update(patch).in("id", sourceIds).eq("notebook_id", notebookId))
    refresh(notebookId)
  }
)

export const deleteSource = action([id, id], async (notebookId, sourceId) => {
  const db = await editor(notebookId)
  const source = must(
    await db.from("sources").delete().eq("id", sourceId).eq("notebook_id", notebookId).select("storage_path").single()
  )
  if (source.storage_path) await db.storage.from("sources").remove([source.storage_path])
  refresh(notebookId)
})

export const sourceDetails = action([id, id], async (notebookId, sourceId) => {
  const db = await createClient()
  const source = must(
    await db.from("sources").select("content, storage_path, summary").eq("id", sourceId).eq("notebook_id", notebookId).single()
  )
  if (!source.storage_path) return { content: source.content, fileUrl: null, summary: source.summary }
  const { data } = await db.storage.from("sources").createSignedUrl(source.storage_path, 600)
  return { content: "", fileUrl: data?.signedUrl ?? null, summary: source.summary }
})

export const saveNote = action(
  [id, z.object({ id: id.optional(), title, content: z.string().max(MAX_TEXT) })],
  async (notebookId, note) => {
    const db = await editor(notebookId)
    const row = { title: note.title || "Neue Notiz", content: note.content }
    if (note.id) must(await db.from("notes").update(row).eq("id", note.id).eq("notebook_id", notebookId))
    else must(await db.from("notes").insert({ ...row, notebook_id: notebookId, kind: "note" }))
    refresh(notebookId)
  }
)

export const deleteNote = action([id, id], async (notebookId, noteId) => {
  const db = await editor(notebookId)
  must(await db.from("notes").delete().eq("id", noteId).eq("notebook_id", notebookId))
  await db.storage.from("studio").remove([`${notebookId}/${noteId}.mp3`])
  refresh(notebookId)
})

export const noteToSource = action([id, id], async (notebookId, noteId) => {
  const db = await editor(notebookId)
  const note = must(await db.from("notes").select("title, content, data").eq("id", noteId).eq("notebook_id", notebookId).single())
  const script = parseStudioData("audio", note.data)
  const content =
    note.content ||
    (script ? script.turns.map((t) => `${HOSTS[t.speaker]}: ${speakable(t.text)}`).join("\n\n") : JSON.stringify(note.data, null, 2))
  must(await db.from("sources").insert({ notebook_id: notebookId, kind: "text", title: note.title, content }))
  refresh(notebookId)
})

async function voiceover(db: Db, notebookId: string, noteId: string, script: AudioScript, language: Language) {
  try {
    if (!(await claimTts(db, notebookId, script.turns, PODCAST_MODEL))) return null
    const { audio, duration, turns } = await synthesize(script.turns, language, PODCAST_MODEL)
    const path = `${notebookId}/${noteId}.mp3`
    await db.storage.from("studio").remove([path])
    const { error } = await db.storage.from("studio").upload(path, audio, { contentType: "audio/mpeg" })
    if (error) throw error
    return { path, duration, model: PODCAST_MODEL, turns } satisfies AudioTrack
  } catch (e) {
    console.error(e)
    return null
  }
}

function runStudioJob(db: Db, notebookId: string, noteId: string, req: StudioRequest) {
  after(async () => {
    try {
      const sources = await selectedSources(db, notebookId)
      const result = await generateStudio(db, sources, req)
      const script = req.kind === "audio" ? parseStudioData("audio", result.data) : null
      if (script) {
        must(await db.from("notes").update({ title: result.title, data: { ...result.data, stage: "voices" } }).eq("id", noteId))
        result.data = { ...result.data, audio: await voiceover(db, notebookId, noteId, script, req.language) }
      }
      await db.from("notes").update({ ...result, status: "ready", error: null }).eq("id", noteId)
    } catch (e) {
      await db.from("notes").update({ status: "failed", error: userMessage(e) }).eq("id", noteId)
    }
  })
}

export const generate = action([id, studioRequestSchema], async (notebookId, req) => {
  const db = await editor(notebookId)
  await selectedSources(db, notebookId)
  await chargeQuota(db)
  const note = must(
    await db
      .from("notes")
      .insert({ notebook_id: notebookId, kind: req.kind, title: studioLabel(req), status: "pending", data: { request: req } })
      .select("id")
      .single()
  )
  runStudioJob(db, notebookId, note.id, req)
  refresh(notebookId)
  return { noteId: note.id }
})

export const retryNote = action([id, id], async (notebookId, noteId) => {
  const db = await editor(notebookId)
  const note = must(await db.from("notes").select("data").eq("id", noteId).eq("notebook_id", notebookId).single())
  const req = studioRequestSchema.safeParse((note.data as { request?: unknown } | null)?.request)
  if (!req.success) throw new UserError("Diese Ausgabe kann nicht neu erstellt werden")
  await chargeQuota(db)
  must(await db.from("notes").update({ status: "pending", error: null, created_at: new Date().toISOString() }).eq("id", noteId))
  runStudioJob(db, notebookId, noteId, req.data)
  refresh(notebookId)
})

export const clearChat = action([id], async (notebookId) => {
  const db = await createClient()
  const { data } = await db.auth.getClaims()
  must(await db.from("messages").delete().eq("notebook_id", notebookId).eq("user_id", data?.claims.sub ?? ""))
  refresh(notebookId)
})

export const ensureGuide = action([id], async (notebookId) => {
  const db = await editor(notebookId)
  const notebook = must(await db.from("notebooks").select("guide").eq("id", notebookId).single())
  if (notebook.guide) return { guide: notebook.guide as Guide }
  const sources = await selectedSources(db, notebookId)
  await chargeQuota(db)
  const guide = await generateGuide(db, sources)
  must(await db.from("notebooks").update({ guide }).eq("id", notebookId))
  return { guide }
})

export const ensureSourceSummary = action([id, id], async (notebookId, sourceId) => {
  const db = await editor(notebookId)
  const source = must(await db.from("sources").select("*").eq("id", sourceId).eq("notebook_id", notebookId).single())
  if (source.summary) return { summary: source.summary }
  await chargeQuota(db)
  const summary = await summarizeSource(db, source)
  must(await db.from("sources").update({ summary }).eq("id", sourceId))
  return { summary }
})

export const askHosts = action(
  [id, id, z.string().trim().min(1, "Bitte stelle eine Frage").max(500), z.number().int().min(0).max(1000)],
  async (notebookId, noteId, question, heard) => {
    const db = await createClient()
    const note = must(await db.from("notes").select("data").eq("id", noteId).eq("notebook_id", notebookId).single())
    const script = parseStudioData("audio", note.data)
    if (!script) throw new UserError("Diese Ausgabe ist keine Audio-Zusammenfassung")
    const stored = (note.data as { language?: string }).language
    const language = stored && stored in LANGUAGES ? (stored as Language) : "Deutsch"
    const all = must(await db.from("sources").select("*").eq("notebook_id", notebookId).order("created_at"))
    const sources = all.some((s) => s.selected) ? all.filter((s) => s.selected) : all
    if (!sources.length) throw new UserError("Dieses Notebook hat keine Quellen")
    await chargeQuota(db)
    const turns = await answerListener(db, sources, script, heard, question, language)
    const voiced = (await claimTts(db, notebookId, turns, "eleven_v4_turbo").catch(() => false))
      ? await synthesize(turns, language, "eleven_v4_turbo").catch(() => null)
      : null
    return {
      turns,
      audio: voiced && { src: `data:audio/mpeg;base64,${voiced.audio.toString("base64")}`, turns: voiced.turns },
    }
  }
)
