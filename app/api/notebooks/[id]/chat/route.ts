import type Anthropic from "@anthropic-ai/sdk"
import type { NextRequest } from "next/server"
import { z } from "zod"
import { createAnswer, encodeEvent, toHistory, type ChatEvent } from "@/lib/chat"
import { UserError, userMessage } from "@/lib/server/action"
import { anthropic, bounded, chargeQuota, CHAT_SYSTEM, MODEL, sourceDocuments } from "@/lib/server/ai"
import { createClient } from "@/lib/supabase/server"

export const maxDuration = 300

const HISTORY = 20

const body = z.object({ message: z.string().trim().min(1).max(20_000) })

export async function POST(request: NextRequest, ctx: RouteContext<"/api/notebooks/[id]/chat">) {
  const { id } = await ctx.params
  const parsed = body.safeParse(await request.json().catch(() => null))
  if (!parsed.success || !z.uuid().safeParse(id).success)
    return Response.json({ error: "Ungültige Nachricht" }, { status: 400 })
  const { message } = parsed.data

  const db = await createClient()
  const [notebook, sources, history] = await Promise.all([
    db.from("notebooks").select("instructions").eq("id", id).maybeSingle(),
    db.from("sources").select("*").eq("notebook_id", id).eq("selected", true).order("created_at"),
    db
      .from("messages")
      .select("role, content")
      .eq("notebook_id", id)
      .order("created_at", { ascending: false })
      .limit(HISTORY),
  ])
  if (!notebook.data) return Response.json({ error: "Notebook nicht gefunden" }, { status: 404 })
  const selected = sources.data ?? []
  if (!selected.length) return Response.json({ error: "Wähle mindestens eine Quelle aus" }, { status: 400 })

  const system = [CHAT_SYSTEM, notebook.data.instructions && `Zusätzliche Anweisungen des Nutzers:\n${notebook.data.instructions}`]
    .filter(Boolean)
    .join("\n\n")

  let messages: Anthropic.MessageParam[]
  try {
    await chargeQuota(db)
    const documents = await sourceDocuments(db, selected, true)
    messages = [
      { role: "user", content: [...documents, { type: "text", text: "Dies sind die Quellen des Notebooks." }] },
      ...toHistory(history.data ?? []),
      { role: "user", content: message },
    ]
    await bounded(system, messages)
    const saved = await db.from("messages").insert({ notebook_id: id, role: "user", content: message })
    if (saved.error) return Response.json({ error: "Dafür fehlen dir die Rechte" }, { status: 403 })
  } catch (e) {
    return Response.json({ error: userMessage(e) }, { status: e instanceof UserError ? 422 : 500 })
  }

  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: ChatEvent) => {
        if (!request.signal.aborted) controller.enqueue(encoder.encode(encodeEvent(event)))
      }
      const answer = createAnswer(selected)
      const persist = () =>
        answer.content &&
        db.from("messages").insert({ notebook_id: id, role: "assistant", content: answer.content, citations: answer.citations })
      try {
        const response = anthropic.messages.stream(
          { model: MODEL, max_tokens: 8000, output_config: { effort: "medium" }, system, messages },
          { signal: request.signal }
        )
        for await (const event of response) answer.push(event).forEach(send)
        const { stop_reason } = await response.finalMessage()
        if (stop_reason === "refusal") send(answer.refuse())
        await persist()
        send(stop_reason === "max_tokens" ? { type: "error", error: "Die Antwort war zu lang und wurde gekürzt." } : { type: "done" })
      } catch (e) {
        await persist()
        if (!request.signal.aborted) send({ type: "error", error: userMessage(e) })
      } finally {
        if (!request.signal.aborted) controller.close()
      }
    },
  })

  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8" } })
}
