"use client"

import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import type { Citation } from "@/lib/types"
import { cn } from "@/lib/utils"

export function Markdown({
  children,
  citations = [],
  onCite,
  className,
}: {
  children: string
  citations?: Citation[]
  onCite?: (citation: Citation) => void
  className?: string
}) {
  return (
    <div
      className={cn(
        "text-[15px] leading-[1.7] break-words",
        "[&_h1]:mt-8 [&_h1]:mb-3 [&_h1]:font-serif [&_h1]:text-4xl [&_h1]:leading-tight [&_h1]:tracking-tight",
        "[&_h2]:mt-8 [&_h2]:mb-2 [&_h2]:font-serif [&_h2]:text-2xl [&_h2]:leading-tight",
        "[&_h3]:mt-6 [&_h3]:mb-1.5 [&_h3]:font-semibold",
        "[&_p]:my-3 [&_strong]:font-semibold [&_a]:underline [&_a]:decoration-foreground/30 [&_a]:underline-offset-2",
        "[&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-1 [&_li]:pl-1 [&_li::marker]:text-muted-foreground",
        "[&_blockquote]:my-4 [&_blockquote]:border-l-2 [&_blockquote]:border-signal [&_blockquote]:pl-4 [&_blockquote]:font-serif [&_blockquote]:text-xl [&_blockquote]:italic",
        "[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:font-mono [&_code]:text-[13px]",
        "[&_table]:my-4 [&_table]:w-full [&_table]:text-sm [&_td]:border-t [&_td]:py-2 [&_td]:pr-3 [&_th]:py-2 [&_th]:pr-3 [&_th]:text-left [&_th]:font-mono [&_th]:text-[11px] [&_th]:tracking-wider [&_th]:text-muted-foreground [&_th]:uppercase",
        "[&_hr]:my-8 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
        className
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a({ href, children }) {
            const match = href?.match(/^#cite-(\d+)$/)
            const citation = match ? citations[Number(match[1])] : undefined
            if (match && citation) return <CitationChip label={String(children)} citation={citation} onCite={onCite} />
            if (match) return null
            return (
              <a href={href} target="_blank" rel="noreferrer">
                {children}
              </a>
            )
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}

function CitationChip({
  label,
  citation,
  onCite,
}: {
  label: string
  citation: Citation
  onCite?: (citation: Citation) => void
}) {
  return (
    <HoverCard>
      <HoverCardTrigger
        delay={150}
        render={
          <button
            type="button"
            onClick={() => onCite?.(citation)}
            aria-label={`Quelle ${label}: ${citation.source_title}`}
            className="relative -top-px mx-0.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-foreground/[0.07] px-1 align-middle font-mono text-[10px] leading-none font-medium text-foreground/70 no-underline transition-colors hover:bg-signal hover:text-signal-foreground focus-visible:bg-signal focus-visible:text-signal-foreground focus-visible:outline-none"
          />
        }
      >
        {label}
      </HoverCardTrigger>
      <HoverCardContent side="top" className="w-80 p-4">
        <p className="label truncate">
          {citation.source_title}
          {citation.page ? ` · S. ${citation.page}` : ""}
        </p>
        <p className="mt-2 line-clamp-6 text-[13px] leading-relaxed">
          <span className="marker">{citation.cited_text.trim()}</span>
        </p>
        <p className="mt-3 text-xs text-muted-foreground">Klicken, um die Stelle in der Quelle zu öffnen</p>
      </HoverCardContent>
    </HoverCard>
  )
}
