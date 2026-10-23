# Prozess-Dokumentation

Ziel: Der gesamte Entstehungsprozess des NotebookLM-Clones wird automatisch festgehalten, inklusive KI-Nutzung, Prompts und Entscheidungen. Daraus lässt sich am Ende ein Video erzeugen.

## Grundidee

Claude Code schreibt jede Session bereits als JSONL nach `~/.claude/projects/-Users-leon-Projekte-notebookllm-clone/`. Dort stehen Prompts, Antworten, Tool-Calls, Zeitstempel und Token-Usage. Diese Rohdaten sind die Quelle. Nichts muss nachträglich rekonstruiert werden.

## Schichten

### 1. Erfassen (automatisch, Hooks)

- `UserPromptSubmit`-Hook: hängt jeden Prompt mit Zeitstempel an `docs/process/log.jsonl`.
- `Stop`-Hook: kopiert die Session-JSONL nach `docs/process/sessions/`.
- Git-Commits sind die Meilensteine. Jeder Commit ist eine Einheit mit Diff.

### 2. Aufbereiten (Script, per `npm run docs` oder nach jedem Commit)

- `docs/process/prompts.md`: chronologische Liste aus Prompt, Zeit, geänderten Dateien und Commit-Hash.
- `docs/process/ai-usage.md`: Anzahl Prompts, Modelle, Tool-Nutzung und Token-Summen aus den `usage`-Feldern der JSONL.
- `docs/process/decisions.md`: Entscheidungen aus Prompts, am Ende von Hand ergänzt.

### 3. Belegen (Screenshots und Aufnahmen)

- Screenshot pro Meilenstein per Chrome-MCP oder Playwright.
- Screen-Recording der Demo mit `screencapture -v`.

### 4. Video (Storyboard, dann Render)

- Das Script erzeugt aus `prompts.md` und den Screenshots ein Storyboard mit einer Szene pro Meilenstein.
- Narration per macOS `say` oder einem TTS-Dienst.
- Zusammenbau mit ffmpeg. Alternativ Remotion, falls mehr Kontrolle nötig ist.

## Hinweise

- KI-Nutzung wird transparent dokumentiert. Die Prompt-Liste mit Ergebnissen zeigt auch Korrekturen und Iterationen.
- Die Session-JSONL-Dateien können Pfade, Umgebungsvariablen und ggf. Secrets enthalten. Vor einem Commit prüfen oder nur die aufbereiteten Markdown-Dateien committen.

## Start (minimal)

1. Ein Hook-Script für `UserPromptSubmit` und `Stop`.
2. Ein Render-Script für `prompts.md` und `ai-usage.md`.
3. Video-Automatisierung erst, wenn das Prompt-Log steht.
