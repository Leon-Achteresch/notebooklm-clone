import assert from "node:assert/strict"
import { mock, test } from "node:test"
import { createThrottle, RULES, waitMessage } from "./rate-limit.ts"

mock.timers.enable({ apis: ["setTimeout", "Date"] })

test("blocks after the limit and frees up as the window slides", () => {
  const throttle = createThrottle()
  for (let i = 0; i < RULES.ai.limit; i++) assert.equal(throttle(["ai", "u1"]), null)
  assert.equal(throttle(["ai", "u1"]), "Zu viele Anfragen. Bitte versuche es in 60 Sekunden noch einmal.")
  assert.equal(throttle(["ai", "u2"]), null)
  mock.timers.tick(RULES.ai.window + 1)
  assert.equal(throttle(["ai", "u1"]), null)
})

test("a blocked request does not use up the other limits", () => {
  const throttle = createThrottle()
  for (let i = 0; i < RULES.guest.limit; i++) throttle(["guest", "1.2.3.4"])
  assert.match(throttle(["login", "1.2.3.4"], ["guest", "1.2.3.4"]) ?? "", /60 Minuten/)
  for (let i = 0; i < RULES.login.limit; i++) assert.equal(throttle(["login", "1.2.3.4"]), null)
  assert.notEqual(throttle(["login", "1.2.3.4"]), null)
})

test("forgets the least recently used keys beyond its capacity", () => {
  const throttle = createThrottle(2)
  for (let i = 0; i < RULES.guest.limit; i++) throttle(["guest", "a"])
  assert.notEqual(throttle(["guest", "a"]), null)
  throttle(["guest", "b"])
  throttle(["guest", "c"])
  assert.equal(throttle(["guest", "a"]), null)
})

test("formats the wait in seconds, minutes or hours", () => {
  assert.equal(waitMessage(400), "Zu viele Anfragen. Bitte versuche es in 1 Sekunde noch einmal.")
  assert.equal(waitMessage(15 * 60_000), "Zu viele Anfragen. Bitte versuche es in 15 Minuten noch einmal.")
  assert.equal(waitMessage(23 * 3_600_000), "Zu viele Anfragen. Bitte versuche es in 23 Stunden noch einmal.")
})
