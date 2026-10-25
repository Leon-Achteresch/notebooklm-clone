import type { Enums, Tables } from "@/lib/database.types"

export type Role = "owner" | Enums<"member_role">
export type NoteKind = Enums<"note_kind">

export type Guide = { summary: string; topics: string[]; questions: string[] }

export type Citation = {
  source_id: string
  source_title: string
  cited_text: string
  page: number | null
  at: number
}

export type Notebook = Omit<Tables<"notebooks">, "guide"> & { guide: Guide | null }
export type Source = Tables<"sources">
export type Note = Tables<"notes">
export type Message = Pick<Tables<"messages">, "id" | "role" | "content" | "created_at"> & { citations: Citation[] }
export type Member = Pick<Tables<"notebook_members">, "user_id" | "email" | "role">
