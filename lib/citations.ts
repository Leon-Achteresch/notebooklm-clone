import type { Citation } from "@/lib/types"

export function withCitationMarkers(content: string, citations: Citation[]) {
  let out = ""
  let pos = 0
  const order = citations.map((c, i) => ({ at: Math.min(c.at, content.length), i })).sort((a, b) => a.at - b.at || a.i - b.i)
  for (const { at, i } of order) {
    out += content.slice(pos, at) + `[${i + 1}](#cite-${i})`
    pos = at
  }
  return out + content.slice(pos)
}
