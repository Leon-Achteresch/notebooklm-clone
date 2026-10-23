"use server"

import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"

function credentials(formData: FormData) {
  return {
    email: String(formData.get("email") ?? "").trim(),
    password: String(formData.get("password") ?? ""),
  }
}

export async function login(formData: FormData) {
  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword(credentials(formData))
  if (error) redirect(`/login?error=${encodeURIComponent(error.message)}`)
  redirect("/")
}

export async function signup(formData: FormData) {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.signUp(credentials(formData))
  if (error) redirect(`/login?error=${encodeURIComponent(error.message)}`)
  if (!data.session)
    redirect(
      `/login?error=${encodeURIComponent("Konto existiert bereits oder E-Mail-Bestätigung ist noch aktiv.")}`
    )
  redirect("/")
}

export async function logout() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect("/login")
}
