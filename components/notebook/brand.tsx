import { cn } from "@/lib/utils"

const MARK =
  "M-22 0Q-36 0 -36 10Q-36 21 -16 24L4 27Q26 30 34.5 37.5Q43 45 47 66L183 654Q188 675 183 682Q178 689 158 693L138 697Q125 700 125 708Q125 720 143 720H465Q490 720 485 697L455 531Q452 514 439 514Q425 514 427 527L429 562Q434 631 407 663Q380 695 338 695Q295 695 275 681Q255 667 248 638L194 402Q191 388 205 388H242Q285 388 306 435L329 484Q332 490 335 493.5Q338 497 344 497Q349 497 353 492.5Q357 488 355 480L303 257Q298 240 287 240Q275 240 275 253V301Q275 336 266 347Q257 358 234 358H198Q183 358 180 344L116 71Q111 50 116 41.5Q121 33 141 30L194 23Q206 22 206 12Q206 0 189 0Z"

function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" aria-hidden className={cn("size-8 shrink-0", className)}>
      <rect width="512" height="512" rx="116" fill="#14171d" />
      <path transform="translate(150 424) scale(.46 -.46)" d={MARK} fill="#faf9f7" />
      <circle cx="292" cy="398" r="27" fill="#e95f22" />
    </svg>
  )
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5 font-serif text-2xl tracking-tight italic", className)}>
      <LogoMark className="size-[1.15em]" />
      <span className="inline-flex items-baseline gap-0.5">
        Folio
        <span className="size-1.5 rounded-full bg-signal" />
      </span>
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
