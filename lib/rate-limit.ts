import { RateLimiter } from "@tanstack/pacer"

const MINUTE = 60_000
const HOUR = 60 * MINUTE

export const RULES = {
  ai: { limit: 12, window: MINUTE },
  aiIp: { limit: 30, window: MINUTE },
  aiIpDay: { limit: 400, window: 24 * HOUR },
  upload: { limit: 30, window: HOUR },
  login: { limit: 10, window: 15 * MINUTE },
  guest: { limit: 5, window: HOUR },
}

export type Rule = keyof typeof RULES

export function waitMessage(ms: number) {
  const seconds = Math.max(1, Math.ceil(ms / 1000))
  const [n, unit] =
    seconds < 90 ? [seconds, "Sekunde"] : seconds < 90 * 60 ? [Math.ceil(seconds / 60), "Minute"] : [Math.ceil(seconds / 3600), "Stunde"]
  return `Zu viele Anfragen. Bitte versuche es in ${n} ${n === 1 ? unit : `${unit}n`} noch einmal.`
}

export function createThrottle(capacity = 10_000) {
  const limiters = new Map<string, RateLimiter<() => void>>()
  const limiter = (rule: Rule, id: string) => {
    const key = `${rule}:${id}`
    const found = limiters.get(key) ?? new RateLimiter(() => {}, { ...RULES[rule], windowType: "sliding" })
    limiters.delete(key)
    limiters.set(key, found)
    if (limiters.size > capacity) limiters.delete(limiters.keys().next().value as string)
    return found
  }
  return (...checks: [Rule, string][]) => {
    const hits = checks.map(([rule, id]) => limiter(rule, id))
    const blocked = hits.filter((l) => l.getRemainingInWindow() === 0)
    if (blocked.length) return waitMessage(Math.max(...blocked.map((l) => l.getMsUntilNextWindow())))
    for (const l of hits) l.maybeExecute()
    return null
  }
}

const shared = globalThis as typeof globalThis & { folioThrottle?: ReturnType<typeof createThrottle> }

export const throttle = (shared.folioThrottle ??= createThrottle())
