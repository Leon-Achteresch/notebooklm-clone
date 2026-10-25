"use server"

import { randomUUID } from "node:crypto"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { after } from "next/server"
import { z } from "zod"
import { action, must, UserError, userMessage } from "@/lib/server/action"
import {
  chargeQuota,
  discoverSources,
  fetchUrl,
  generateGuide,
  generateStudio,
  summarizeSource,
} from "@/lib/server/ai"
import { studioLabel, studioRequestSchema, type StudioRequest } from "@/lib/studio"
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

export async function createNotebook() {
  const db = await createClient()
  const notebook = must(await db.from("notebooks").insert({}).select("id").single())
  redirect(`/notebook/${notebook.id}`)
}

export const deleteNotebook = action([id], async (notebookId) => {
  const db = await createClient()
  const { data: files } = await db.storage.from("sources").list(notebookId, { limit: 10000 })
  must(await db.from("notebooks").delete().eq("id", notebookId).select("id").single())
  if (files?.length) await db.storage.from("sources").remove(files.map((f) => `${notebookId}/${f.name}`))
  revalidatePath("/")
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
  const db = await editor(notebookId)
  must(await db.from("sources").insert({ notebook_id: notebookId, kind: "text", title: name || content.slice(0, 60), content }))
  refresh(notebookId)
})

export const addFileSource = action([id, z.instanceof(FormData)], async (notebookId, form) => {
  const file = form.get("file")
  if (!(file instanceof File) || file.size === 0) throw new UserError("Keine Datei ausgewählt")
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
  refresh(notebookId)
})

export const noteToSource = action([id, id], async (notebookId, noteId) => {
  const db = await editor(notebookId)
  const note = must(await db.from("notes").select("title, content, data").eq("id", noteId).eq("notebook_id", notebookId).single())
  const content = note.content || JSON.stringify(note.data, null, 2)
  must(await db.from("sources").insert({ notebook_id: notebookId, kind: "text", title: note.title, content }))
  refresh(notebookId)
})

function runStudioJob(db: Db, notebookId: string, noteId: string, req: StudioRequest) {
  after(async () => {
    try {
      const sources = await selectedSources(db, notebookId)
      const result = await generateStudio(db, sources, req)
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
