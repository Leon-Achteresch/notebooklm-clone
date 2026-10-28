const running = new Map<string, Promise<unknown>>()

export function oneAtATime<T>(key: string, task: () => Promise<T>) {
  const run = (running.get(key) ?? Promise.resolve()).catch(() => {}).then(task)
  running.set(key, run)
  const release = () => running.get(key) === run && running.delete(key)
  run.then(release, release)
  return run
}
