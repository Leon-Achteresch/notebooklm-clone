import { logout } from "@/app/login/actions"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/server"

export default async function Page() {
  const supabase = await createClient()
  const { data: profile } = await supabase.from("users").select("email").single()

  return (
    <div className="flex min-h-svh p-6">
      <div className="flex max-w-md min-w-0 flex-col gap-4 text-sm leading-loose">
        <p>Angemeldet als {profile?.email}</p>
        <form>
          <Button formAction={logout} variant="outline">
            Abmelden
          </Button>
        </form>
      </div>
    </div>
  )
}
