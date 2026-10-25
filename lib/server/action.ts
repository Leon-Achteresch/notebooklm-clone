import "server-only"
import Anthropic from "@anthropic-ai/sdk"
import type { PostgrestError } from "@supabase/supabase-js"
import { unstable_rethrow } from "next/navigation"
import { z } from "zod"

z.config(z.locales.de())

export class UserError extends Error {}

export type ActionResult<T extends object = object> =
  | (T & { error?: undefined })
  | ({ error: string } & { [K in keyof T]?: undefined })

export function userMessage(e: unknown) {
  if (e instanceof UserError) return e.message
  if (e instanceof Anthropic.APIError) {
    if (e.status === 429 || e.status === 529) return "Die KI ist gerade ausgelastet. Bitte versuche es gleich noch einmal."
    if (e.status === 400 && /too long|too many tokens/i.test(e.message))
      return "Die ausgewählten Quellen sind zu umfangreich. Wähle weniger Quellen aus."
  }
  console.error(e)
  return "Etwas ist schiefgelaufen. Bitte versuche es erneut."
}

export function must<R extends { data: unknown; error: PostgrestError | null }>(res: R): Extract<R, { error: null }>["data"] {
  if (!res.error) return res.data
  if (res.error.code === "P0001") throw new UserError(res.error.message)
  if (res.error.code === "PGRST116") throw new UserError("Nicht gefunden")
  if (res.error.code === "42501") throw new UserError("Dafür fehlen dir die Rechte")
  throw new Error(`${res.error.code}: ${res.error.message}`)
}

type Schemas = readonly [z.ZodType, ...z.ZodType[]]
type Out<A extends Schemas> = { [K in keyof A]: z.output<A[K]> }
type In<A extends Schemas> = { [K in keyof A]: z.input<A[K]> }

export function action<const A extends Schemas, R extends object | void>(
  args: A,
  handler: (...input: Out<A>) => Promise<R>
) {
  const schema = z.tuple(args as unknown as [z.ZodType, ...z.ZodType[]])
  return async (...input: In<A>): Promise<ActionResult<R extends object ? R : object>> => {
    const parsed = schema.safeParse(input)
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Ungültige Eingabe" }
    try {
      return ((await handler(...(parsed.data as Out<A>))) ?? {}) as R extends object ? R : object
    } catch (e) {
      unstable_rethrow(e)
      return { error: userMessage(e) }
    }
  }
}
