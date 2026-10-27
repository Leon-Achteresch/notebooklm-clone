"use server"

import type { AuthError } from "@supabase/supabase-js"
import { redirect } from "next/navigation"
import { throttle, type Rule } from "@/lib/rate-limit"
import { clientIp } from "@/lib/server/action"
import { createClient } from "@/lib/supabase/server"

const MESSAGES: Record<string, string> = {
  invalid_credentials: "E-Mail oder Passwort ist falsch.",
  user_already_exists: "Für diese E-Mail gibt es schon ein Konto. Melde dich einfach an.",
  email_exists: "Für diese E-Mail gibt es schon ein Konto. Melde dich einfach an.",
  weak_password: "Das Passwort ist zu schwach. Nimm mindestens sechs Zeichen.",
  over_request_rate_limit: "Zu viele Versuche. Bitte warte kurz.",
  anonymous_provider_disabled: "Der Gastzugang ist gerade deaktiviert.",
}

function fail(error: AuthError): never {
  redirect(`/login?error=${encodeURIComponent(MESSAGES[error.code ?? ""] ?? error.message)}`)
}

async function throttled(rule: Rule) {
  const wait = throttle([rule, await clientIp()])
  if (wait) redirect(`/login?error=${encodeURIComponent(wait)}`)
}

function credentials(formData: FormData) {
  return {
    email: String(formData.get("email") ?? "").trim(),
    password: String(formData.get("password") ?? ""),
  }
}

export async function login(formData: FormData) {
  await throttled("login")
  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword(credentials(formData))
  if (error) fail(error)
  redirect("/")
}

export async function signup(formData: FormData) {
  await throttled("login")
  const supabase = await createClient()
  const { data, error } = await supabase.auth.signUp(credentials(formData))
  if (error) fail(error)
  if (!data.session)
    redirect(`/login?error=${encodeURIComponent("Bestätige deine E-Mail-Adresse über den Link in deinem Postfach und melde dich dann an.")}`)
  redirect("/")
}

export async function guest() {
  await throttled("guest")
  const supabase = await createClient()
  const { error } = await supabase.auth.signInAnonymously()
  if (error) fail(error)
  redirect("/")
}

export async function logout() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect("/login")
}
