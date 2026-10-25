import { cn } from "@/lib/utils"

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-baseline gap-0.5 font-serif text-2xl tracking-tight italic", className)}>
      Folio
      <span className="size-1.5 rounded-full bg-signal" />
    </span>
  )
}

const PALETTES = [
  ["oklch(0.86 0.11 62)", "oklch(0.72 0.17 35)", "oklch(0.9 0.06 95)"],
  ["oklch(0.82 0.07 230)", "oklch(0.6 0.12 255)", "oklch(0.92 0.04 200)"],
  ["oklch(0.85 0.07 150)", "oklch(0.62 0.09 165)", "oklch(0.93 0.05 110)"],
  ["oklch(0.84 0.08 310)", "oklch(0.64 0.14 290)", "oklch(0.92 0.04 350)"],
  ["oklch(0.86 0.05 70)", "oklch(0.58 0.07 50)", "oklch(0.93 0.03 90)"],
  ["oklch(0.8 0.1 20)", "oklch(0.55 0.15 15)", "oklch(0.9 0.06 60)"],
] as const

function hash(value: string) {
  let h = 0
  for (const ch of value) h = (h * 31 + ch.charCodeAt(0)) | 0
  return Math.abs(h)
}

export function Cover({ seed, className, children }: { seed: string; className?: string; children?: React.ReactNode }) {
  const h = hash(seed)
  const [a, b, c] = PALETTES[h % PALETTES.length]
  const x = 15 + (h % 60)
  const y = 20 + ((h >> 3) % 50)
  return (
    <div
      className={cn("grain overflow-hidden", className)}
      style={{
        background: `radial-gradient(90% 80% at ${x}% ${y}%, ${a}, transparent 70%), radial-gradient(80% 90% at ${100 - x}% 100%, ${b}, transparent 65%), ${c}`,
      }}
    >
      {children}
    </div>
  )
}
