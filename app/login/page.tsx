import { ArrowRightIcon, SparklesIcon } from "lucide-react"
import { guest, login, signup } from "@/app/login/actions"
import { Cover, Wordmark } from "@/components/notebook/brand"
import { LoginShowcase } from "@/components/notebook/login-showcase"
import { WordReveal } from "@/components/notebook/reveal"
import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams

  return (
    <div className="grid min-h-svh lg:grid-cols-[1.15fr_1fr]">
      <Cover seed="folio-login-golden" className="relative hidden flex-col justify-between p-12 text-neutral-900 lg:flex">
        <Wordmark className="text-3xl" />
        <LoginShowcase />
        <p className="max-w-sm font-serif text-4xl leading-[1.05]">
          Deine Quellen.
          <br />
          <span className="italic">Jede Antwort belegt.</span>
        </p>
      </Cover>

      <main className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <Wordmark className="mb-12 text-3xl lg:hidden" />
          <h1 className="font-serif text-5xl leading-none tracking-tight">
            <WordReveal text="Willkommen." />
          </h1>
          <p className="mt-3 text-muted-foreground">Melde dich an oder lege in Sekunden ein Konto an.</p>
          <form className="mt-10">
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="email">E-Mail</FieldLabel>
                <Input id="email" name="email" type="email" autoComplete="email" required className="h-11" />
              </Field>
              <Field>
                <FieldLabel htmlFor="password">Passwort</FieldLabel>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  minLength={6}
                  required
                  className="h-11"
                />
              </Field>
              {error && (
                <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </p>
              )}
              <div className="flex flex-col gap-2 pt-2">
                <Button type="submit" formAction={login} size="lg" className="h-11">
                  Anmelden
                </Button>
                <Button type="submit" formAction={signup} variant="ghost" size="lg" className="h-11">
                  Neues Konto erstellen
                </Button>
              </div>
            </FieldGroup>
          </form>
          <div className="my-8 flex items-center gap-3 font-mono text-[11px] tracking-widest text-muted-foreground uppercase">
            <span className="h-px flex-1 bg-border" />
            oder
            <span className="h-px flex-1 bg-border" />
          </div>
          <form action={guest}>
            <button
              type="submit"
              className="group flex w-full items-center gap-4 rounded-2xl border p-4 text-left transition-colors outline-none hover:border-foreground/30 hover:bg-card focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-signal text-signal-foreground">
                <SparklesIcon className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium">Ohne Konto ausprobieren</span>
                <span className="block text-sm text-muted-foreground">Mit Beispiel-Notebook, Podcast und Mindmap</span>
              </span>
              <ArrowRightIcon className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </button>
          </form>
        </div>
      </main>
    </div>
  )
}
