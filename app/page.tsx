import Link from "next/link"
import { ArrowUpRightIcon, PlusIcon } from "lucide-react"
import { createNotebook } from "@/app/notebook/actions"
import { Magnetic } from "@/components/motion/magnetic"
import { Cover, Wordmark } from "@/components/notebook/brand"
import {
  Lift,
  Stagger,
  StaggerItem,
  WordReveal,
} from "@/components/notebook/reveal"
import { UserMenu } from "@/components/notebook/user-menu"
import { createClient } from "@/lib/supabase/server"

type Row = {
  id: string
  title: string
  owner_id: string
  created_at: string
  featured: boolean
  sources: { count: number }[]
}

function greeting() {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      hour: "numeric",
      hourCycle: "h23",
      timeZone: "Europe/Berlin",
    }).format(new Date())
  )
  if (hour < 5) return "Gute Nacht"
  if (hour < 11) return "Guten Morgen"
  if (hour < 18) return "Guten Tag"
  return "Guten Abend"
}

export default async function Page() {
  const supabase = await createClient()
  const [{ data: claims }, { data }, { data: memberships }] = await Promise.all([
    supabase.auth.getClaims(),
    supabase
      .from("notebooks")
      .select("id, title, owner_id, created_at, featured, sources(count)")
      .order("created_at", { ascending: false }),
    supabase.from("notebook_members").select("notebook_id, user_id"),
  ])
  const notebooks = (data ?? []) as Row[]
  const userId = claims?.claims.sub
  const isGuest = claims?.claims.is_anonymous === true
  const email = String(claims?.claims.email ?? "")
  const name = email.split("@")[0].split(/[._+-]/)[0]
  const member = new Set(
    (memberships ?? []).filter((m) => m.user_id === userId).map((m) => m.notebook_id)
  )
  const mine = notebooks.filter((n) => n.owner_id === userId)
  const featured = notebooks.filter((n) => n.featured && n.owner_id !== userId)
  const shared = notebooks.filter(
    (n) => n.owner_id !== userId && member.has(n.id)
  )
  const discover = featured.length > 0 && (
    <section className={mine.length ? "mt-24" : "mb-24"}>
      <h2 className="label mb-6">Entdecken</h2>
      <Stagger className="grid gap-6 lg:grid-cols-2">
        {featured.map((n) => (
          <StaggerItem key={n.id}>
            <FeaturedCard notebook={n} />
          </StaggerItem>
        ))}
      </Stagger>
    </section>
  )
  const sourceCount = mine.reduce(
    (sum, n) => sum + (n.sources[0]?.count ?? 0),
    0
  )

  return (
    <div className="min-h-svh">
      <header className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6 lg:px-10">
        <Wordmark />
        <UserMenu email={isGuest ? "Gast" : email} guest={isGuest} />
      </header>

      <main className="mx-auto max-w-7xl px-6 pb-32 lg:px-10">
        <section className="pt-16 pb-14 lg:pt-24 lg:pb-20">
          <p className="label rise">
            {mine.length} {mine.length === 1 ? "Notebook" : "Notebooks"} ·{" "}
            {sourceCount} {sourceCount === 1 ? "Quelle" : "Quellen"}
          </p>
          <h1 className="mt-5 font-serif text-[clamp(3rem,7vw,6.5rem)] leading-[0.92] tracking-[-0.02em]">
            <WordReveal
              text={`${greeting()}${name ? `, ${name[0].toUpperCase()}${name.slice(1)}` : ""}.`}
            />
            <br />
            <WordReveal
              text="Was willst du verstehen?"
              delay={0.25}
              className="text-muted-foreground italic"
            />
          </h1>
        </section>

        {!mine.length && discover}

        {!mine.length && featured.length > 0 && (
          <h2 className="label mb-6">Deine Notebooks</h2>
        )}
        <Stagger
          delay={0.35}
          className="grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-4"
        >
          <StaggerItem>
            <form action={createNotebook}>
              <button
                type="submit"
                className="group flex w-full items-center gap-4 rounded-2xl border border-dashed border-foreground/20 p-5 text-left transition-colors outline-none hover:border-foreground/50 hover:bg-card focus-visible:ring-3 focus-visible:ring-ring/50 sm:aspect-[4/3] sm:flex-col sm:items-start sm:justify-between sm:gap-0"
              >
                <Magnetic strength={0.3}>
                  <span className="flex size-10 items-center justify-center rounded-full bg-foreground text-background transition-transform duration-300 group-hover:rotate-90">
                    <PlusIcon className="size-5" />
                  </span>
                </Magnetic>
                <span>
                  <span className="block font-serif text-2xl">
                    Neues Notebook
                  </span>
                  <span className="mt-1 block text-sm text-muted-foreground">
                    PDFs, Links und Notizen an einem Ort
                  </span>
                </span>
              </button>
            </form>
          </StaggerItem>
          {mine.map((n) => (
            <StaggerItem key={n.id}>
              <NotebookCard notebook={n} />
            </StaggerItem>
          ))}
        </Stagger>

        {mine.length > 0 && discover}

        {shared.length > 0 && (
          <section className="mt-24">
            <h2 className="label mb-6">Mit dir geteilt</h2>
            <Stagger className="grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
              {shared.map((n) => (
                <StaggerItem key={n.id}>
                  <NotebookCard notebook={n} />
                </StaggerItem>
              ))}
            </Stagger>
          </section>
        )}
      </main>
    </div>
  )
}

function FeaturedCard({ notebook }: { notebook: Row }) {
  const count = notebook.sources[0]?.count ?? 0
  return (
    <Link
      href={`/notebook/${notebook.id}`}
      className="group block rounded-3xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <Lift>
        <Cover
          seed={notebook.id}
          className="relative flex aspect-[16/9] flex-col justify-between rounded-3xl p-7 text-neutral-900 ring-1 ring-foreground/5 sm:aspect-[2/1]"
        >
          <span className="flex items-center justify-between">
            <span className="rounded-full bg-white/70 px-3 py-1 font-mono text-[10.5px] tracking-widest uppercase backdrop-blur">
              Beispiel-Notebook
            </span>
            <span className="flex size-9 items-center justify-center rounded-full bg-neutral-900 text-white transition-transform duration-300 group-hover:scale-110">
              <ArrowUpRightIcon className="size-4" />
            </span>
          </span>
          <span>
            <span className="block font-serif text-5xl leading-none sm:text-6xl">
              {notebook.title}
            </span>
            <span className="mt-3 block max-w-md text-[15px] text-neutral-900/70">
              {count} {count === 1 ? "Quelle" : "Quellen"} · Podcast, Mindmap,
              Präsentation, Quiz und mehr sind schon erstellt. Stell Fragen
              oder mach dir eine eigene Kopie.
            </span>
          </span>
        </Cover>
      </Lift>
    </Link>
  )
}

function NotebookCard({ notebook }: { notebook: Row }) {
  const count = notebook.sources[0]?.count ?? 0
  const date = new Date(notebook.created_at).toLocaleDateString("de-DE", {
    day: "numeric",
    month: "short",
    timeZone: "Europe/Berlin",
  })
  return (
    <Link
      href={`/notebook/${notebook.id}`}
      className="group block rounded-2xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <Lift>
        <Cover
          seed={notebook.id}
          className="relative aspect-[4/3] rounded-2xl ring-1 ring-foreground/5"
        >
          <span className="absolute top-4 right-4 flex size-8 items-center justify-center rounded-full bg-white/70 text-neutral-900 opacity-0 backdrop-blur transition-opacity group-hover:opacity-100">
            <ArrowUpRightIcon className="size-4" />
          </span>
          <span className="absolute bottom-3 left-5 font-serif text-7xl text-white/90 italic">
            {notebook.title.trim()[0]?.toUpperCase()}
          </span>
        </Cover>
      </Lift>
      <h3 className="mt-4 line-clamp-2 font-serif text-2xl leading-tight">
        {notebook.title}
      </h3>
      <p className="label mt-1.5">
        {count} {count === 1 ? "Quelle" : "Quellen"} · {date}
      </p>
    </Link>
  )
}
