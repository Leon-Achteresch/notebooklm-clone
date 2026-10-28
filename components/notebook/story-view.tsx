"use client"

import { useState } from "react"
import { motion } from "motion/react"
import { AudioLinesIcon, SparklesIcon } from "lucide-react"
import { voiceEpisode } from "@/app/notebook/actions"
import { AudioPlayer } from "@/components/notebook/audio-player"
import { AudioView } from "@/components/notebook/studio-viewers"
import { useRun } from "@/components/notebook/use-run"
import { Button } from "@/components/ui/button"
import { episodeTracks } from "@/lib/audio"
import { SPRING_LAYOUT } from "@/lib/ease"
import { HOSTS, STORY, type Language, type Story } from "@/lib/studio"
import { cn } from "@/lib/utils"

const NARRATOR = `Erzählt von ${HOSTS[STORY.narrator]}`

export function StoryView({
  notebookId,
  noteId,
  story,
  data,
  language,
  canEdit,
}: {
  notebookId: string
  noteId: string
  story: Story
  data: unknown
  language: Language
  canEdit: boolean
}) {
  const [index, setIndex] = useState(0)
  const [pending, run] = useRun()
  const tracks = episodeTracks(data)
  const episodes = story.episodes.slice(0, STORY.episodes)
  const episode = episodes[index]
  const track = tracks[index]
  if (!episode) return null
  const script = { title: episode.title, turns: episode.turns }

  return (
    <div className="flex flex-col gap-5">
      <p className="font-serif text-lg leading-snug text-balance text-muted-foreground">{story.synopsis}</p>
      <div role="tablist" aria-label="Folgen" className="grid gap-1.5 sm:grid-cols-3">
        {episodes.map((e, i) => (
          <button
            key={i}
            role="tab"
            aria-selected={i === index}
            onClick={() => setIndex(i)}
            className="relative rounded-xl border p-3 text-left transition-colors hover:bg-muted/40"
          >
            {i === index && (
              <motion.span layoutId={`episode-${noteId}`} transition={SPRING_LAYOUT} className="absolute inset-0 rounded-xl bg-muted" />
            )}
            <span className="label relative flex items-center gap-1.5">
              Folge {i + 1}
              {tracks[i] && <AudioLinesIcon aria-label="vertont" className="size-3" />}
            </span>
            <span className={cn("relative mt-1 line-clamp-2 block text-sm", i !== index && "text-muted-foreground")}>{e.title}</span>
          </button>
        ))}
      </div>
      {track ? (
        <AudioPlayer key={index} notebookId={notebookId} noteId={noteId} script={script} track={track} language={language} narrator={NARRATOR} />
      ) : (
        <>
          {canEdit && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3">
              <p className="text-sm text-muted-foreground">Diese Folge liest gerade dein Browser vor.</p>
              <Button size="sm" disabled={pending} onClick={() => run(() => voiceEpisode(notebookId, noteId, index), "Folge vertont")}>
                <SparklesIcon /> {pending ? "Wird vertont …" : "Mit KI-Stimme vertonen"}
              </Button>
            </div>
          )}
          <AudioView key={index} data={script} language={language} narrator={NARRATOR} />
        </>
      )}
    </div>
  )
}
