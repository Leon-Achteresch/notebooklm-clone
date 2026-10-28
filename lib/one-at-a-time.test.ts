import assert from "node:assert/strict"
import { test } from "node:test"
import { oneAtATime } from "./one-at-a-time.ts"

const tick = () => new Promise((resolve) => setTimeout(resolve, 5))

test("oneAtATime runs tasks with the same key one after another, even after a failure", async () => {
  const log: string[] = []
  const task = (name: string, fail = false) => async () => {
    log.push(`${name} start`)
    await tick()
    log.push(`${name} end`)
    if (fail) throw new Error(name)
  }
  const results = await Promise.allSettled([
    oneAtATime("note", task("a", true)),
    oneAtATime("note", task("b")),
    oneAtATime("other", task("c")),
  ])
  assert.deepEqual(results.map((r) => r.status), ["rejected", "fulfilled", "fulfilled"])
  assert.ok(log.indexOf("a end") < log.indexOf("b start"))
  assert.ok(log.indexOf("c start") < log.indexOf("a end"))
})
