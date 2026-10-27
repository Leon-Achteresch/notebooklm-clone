"use client"

import { useMemo, useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import { ArrowUpIcon, CheckIcon, CopyIcon, DownloadIcon, SearchIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { downloadBlob } from "@/lib/browser-utils"
import { SPRING_SWAP } from "@/lib/ease"
import type { DataTable } from "@/lib/studio"
import { csvName, filterRows, isNumericColumn, normalizeRows, sortRows, toDelimited, type SortDirection } from "@/lib/table"
import { cn } from "@/lib/utils"

const lines = (n: number) => `${n} ${n === 1 ? "Zeile" : "Zeilen"}`

export function TableView({ data }: { data: DataTable }) {
  const { columns } = data
  const rows = useMemo(() => (columns.length ? normalizeRows(data.rows, columns.length) : []), [data.rows, columns.length])
  const numeric = useMemo(() => columns.map((_, c) => isNumericColumn(rows.map((row) => row[c]))), [columns, rows])
  const [query, setQuery] = useState("")
  const [sort, setSort] = useState<{ column: number; direction: SortDirection } | null>(null)
  const [copied, setCopied] = useState(false)
  const visible = useMemo(() => {
    const filtered = filterRows(rows, query)
    return sort ? sortRows(filtered, sort.column, sort.direction, numeric[sort.column]) : filtered
  }, [rows, query, sort, numeric])

  const toggleSort = (column: number) =>
    setSort((s) => (s?.column !== column ? { column, direction: "asc" } : s.direction === "asc" ? { column, direction: "desc" } : null))

  const copy = () =>
    navigator.clipboard.writeText(toDelimited([columns, ...visible], "\t")).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    }, () => {})

  return (
    <div className="flex h-full min-h-0 flex-col gap-5">
      {data.description && <p className="max-w-2xl text-[15px] leading-relaxed text-pretty text-muted-foreground">{data.description}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape" && query) {
                e.stopPropagation()
                setQuery("")
              }
            }}
            placeholder="Tabelle filtern…"
            aria-label="Tabelle filtern"
            className="pl-8"
          />
        </div>
        <p aria-live="polite" className="mr-auto px-1 font-mono text-xs text-muted-foreground tabular-nums">
          {query.trim() ? `${visible.length} von ${lines(rows.length)}` : lines(rows.length)}
        </p>
        <Button variant="outline" onClick={copy} disabled={!rows.length}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={copied ? "done" : "copy"}
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.5, opacity: 0 }}
              transition={SPRING_SWAP}
            >
              {copied ? <CheckIcon /> : <CopyIcon />}
            </motion.span>
          </AnimatePresence>
          {copied ? "Kopiert" : "Kopieren"}
        </Button>
        <Button
          variant="outline"
          disabled={!rows.length}
          onClick={() => downloadBlob(`﻿${toDelimited([columns, ...visible], ";")}`, csvName(data.title), "text/csv;charset=utf-8")}
        >
          <DownloadIcon /> Als CSV
        </Button>
      </div>

      <div className="relative max-h-[70svh] min-h-0 flex-1 overflow-auto rounded-xl border bg-card">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <TableHeader className="sticky top-0 z-20">
            <TableRow className="hover:bg-transparent">
              {columns.map((column, c) => {
                const direction = sort?.column === c ? sort.direction : undefined
                return (
                  <TableHead
                    key={c}
                    aria-sort={direction && (direction === "asc" ? "ascending" : "descending")}
                    className={cn("h-auto border-b bg-card p-0 align-bottom", c === 0 && "sticky left-0 z-10 border-r")}
                  >
                    <button
                      onClick={() => toggleSort(c)}
                      className={cn(
                        "group/sort flex w-full items-center gap-1.5 px-4 pt-4 pb-2.5 text-left text-[12.5px] font-medium whitespace-normal text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset",
                        numeric[c] && "flex-row-reverse text-right",
                        direction && "text-foreground"
                      )}
                    >
                      {column}
                      <motion.span
                        animate={{ rotate: direction === "desc" ? 180 : 0 }}
                        transition={SPRING_SWAP}
                        className={cn("shrink-0 transition-opacity", direction ? "opacity-100" : "opacity-0 group-hover/sort:opacity-40")}
                      >
                        <ArrowUpIcon className="size-3.5" />
                      </motion.span>
                    </button>
                  </TableHead>
                )
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((row, r) => (
              <TableRow key={r} className="group/row border-0 hover:bg-muted">
                {row.map((value, c) =>
                  c === 0 ? (
                    <th
                      key={c}
                      scope="row"
                      className="sticky left-0 z-10 max-w-56 min-w-32 border-r border-b bg-card px-4 py-3 text-left align-top font-medium transition-colors group-last/row:border-b-0 group-hover/row:bg-muted"
                    >
                      {value}
                    </th>
                  ) : (
                    <TableCell
                      key={c}
                      className={cn(
                        "border-b px-4 py-3 align-top group-last/row:border-b-0",
                        numeric[c] ? "text-right tabular-nums" : "max-w-80 min-w-40 whitespace-normal"
                      )}
                    >
                      {value}
                    </TableCell>
                  )
                )}
              </TableRow>
            ))}
          </TableBody>
        </table>
        {!visible.length && (
          <div className="sticky left-0 flex flex-col items-center gap-2 px-6 py-14 text-center">
            <p className="font-serif text-2xl">{rows.length ? "Keine Treffer" : "Keine Daten"}</p>
            <p className="max-w-xs text-sm text-muted-foreground">
              {rows.length ? `Keine Zeile enthält „${query.trim()}“.` : "Diese Tabelle enthält keine Zeilen."}
            </p>
            {rows.length > 0 && (
              <Button variant="outline" size="sm" className="mt-3" onClick={() => setQuery("")}>
                Filter zurücksetzen
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
