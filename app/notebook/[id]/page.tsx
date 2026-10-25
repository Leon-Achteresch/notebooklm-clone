import { notFound } from "next/navigation"
import { NotebookView } from "@/components/notebook/notebook-view"
import { createClient } from "@/lib/supabase/server"
import type { Guide, Message, Note, Role } from "@/lib/types"

export const maxDuration = 300

const STALE_JOB_MS = 10 * 60 * 1000

function expireStaleJobs(notes: Note[]): Note[] {
  const now = Date.now()
  return notes.map((n) =>
    n.status === "pending" && now - Date.parse(n.created_at) > STALE_JOB_MS
      ? { ...n, status: "failed", error: "Zeitüberschreitung bei der Erstellung" }
      : n
  )
}

export default async function NotebookPage({ params }: PageProps<"/notebook/[id]">) {
  const { id } = await params
  const db = await createClient()

  const [notebook, role, sources, notes, messages, members] = await Promise.all([
    db.from("notebooks").select("*").eq("id", id).maybeSingle(),
    db.rpc("notebook_role", { nid: id }),
    db
      .from("sources")
      .select("id, notebook_id, kind, title, url, storage_path, selected, summary, created_at")
      .eq("notebook_id", id)
      .order("created_at"),
    db.from("notes").select("*").eq("notebook_id", id).order("created_at", { ascending: false }),
    db.from("messages").select("id, role, content, citations, created_at").eq("notebook_id", id).order("created_at"),
    db.from("notebook_members").select("user_id, email, role").eq("notebook_id", id),
  ])
  if (!notebook.data || !role.data) notFound()

  return (
    <NotebookView
      notebook={{ ...notebook.data, guide: notebook.data.guide as Guide | null }}
      role={role.data as Role}
      sources={(sources.data ?? []).map((s) => ({ ...s, content: "" }))}
      notes={expireStaleJobs(notes.data ?? [])}
      messages={(messages.data ?? []) as Message[]}
      members={members.data ?? []}
    />
  )
}
