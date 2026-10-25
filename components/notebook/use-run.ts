"use client"

import { useTransition } from "react"
import { toast } from "@/components/ui/toast"

export function useRun() {
  const [pending, start] = useTransition()
  const run = (fn: () => Promise<{ error?: string } | void>, success?: string) =>
    start(async () => {
      const result = await fn()
      if (result?.error) toast.add({ title: result.error, type: "error" })
      else if (success) toast.add({ title: success, type: "success" })
    })
  return [pending, run] as const
}
