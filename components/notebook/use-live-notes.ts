"use client"

import { useRouter } from "next/navigation"
import { useEffect } from "react"
import { createClient } from "@/lib/supabase/client"

const FALLBACK_POLL_MS = 8000

export function useLiveNotes(notebookId: string, hasPendingJobs: boolean) {
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()
    let timer: ReturnType<typeof setTimeout> | undefined
    const refresh = () => {
      clearTimeout(timer)
      timer = setTimeout(() => router.refresh(), 150)
    }
    const channel = supabase
      .channel(`notes:${notebookId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "notes", filter: `notebook_id=eq.${notebookId}` }, refresh)
      .subscribe()
    return () => {
      clearTimeout(timer)
      supabase.removeChannel(channel)
    }
  }, [notebookId, router])

  useEffect(() => {
    if (!hasPendingJobs) return
    const poll = setInterval(() => router.refresh(), FALLBACK_POLL_MS)
    return () => clearInterval(poll)
  }, [hasPendingJobs, router])
}
