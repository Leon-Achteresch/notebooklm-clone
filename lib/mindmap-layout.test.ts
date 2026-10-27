import assert from "node:assert/strict"
import { test } from "node:test"
import { flattenMindMap, layoutMindMap, lineage, type LayoutNode, type MindMapItem } from "./mindmap-layout.ts"

const map = {
  title: "Honigbienen",
  branches: [
    {
      title: "Ökologische Bedeutung",
      children: [
        { title: "Bestäubung", children: ["Obstbau", "Wildpflanzen", "Raps und Sonnenblumen"] },
        { title: "Biodiversität", children: [] },
      ],
    },
    { title: "Ein sehr langer Zweig, der in mehrere Zeilen umbricht", children: [{ title: "Kurz", children: [] }] },
    {
      title: "Imkerei",
      children: [
        { title: "Honigernte", children: ["Schleudern", "Abfüllen"] },
        { title: "Varroa-Milbe", children: ["Ameisensäure", "Drohnenbrut", "Resistenzzucht", "Monitoring"] },
        { title: "Überwinterung", children: ["Futtervorrat"] },
      ],
    },
    { title: "Leerer Zweig", children: [] },
  ],
}

const size = (item: MindMapItem) => ({
  width: 48 + Math.min(item.label.length, 28) * 7,
  height: (item.depth ? 30 : 48) + Math.floor(item.label.length / 28) * 18,
})

const everything = new Set<string>()
const states = [everything, new Set(["0", "2-1"]), new Set(["1", "2"]), new Set(flattenMindMap(map).map((i) => i.id))]
const center = (n: LayoutNode) => n.y + n.height / 2

test("no two visible nodes overlap", () => {
  for (const collapsed of states) {
    const { nodes } = layoutMindMap(map, collapsed, size)
    for (const [i, a] of nodes.entries())
      for (const b of nodes.slice(i + 1))
        assert.ok(
          a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y,
          `${a.id} overlaps ${b.id}`
        )
  }
})

test("parents sit left of their children and centred on their span", () => {
  for (const collapsed of states) {
    const { nodes } = layoutMindMap(map, collapsed, size)
    for (const parent of nodes) {
      const kids = nodes.filter((n) => n.parent === parent.id)
      if (!kids.length) continue
      for (const kid of kids) assert.ok(kid.x > parent.x + parent.width)
      assert.ok(Math.abs(center(parent) - (center(kids[0]) + center(kids.at(-1)!)) / 2) < 1e-9, parent.id)
    }
  }
})

test("collapsing hides all descendants but keeps the node", () => {
  const { nodes, edges } = layoutMindMap(map, new Set(["0", "2-1"]), size)
  const ids = nodes.map((n) => n.id)
  assert.ok(!ids.some((id) => id.startsWith("0-") || id.startsWith("2-1-")))
  assert.ok(ids.includes("2-0-1") && ids.includes("2-1"))
  assert.equal(nodes.find((n) => n.id === "0")?.collapsed, true)
  assert.equal(nodes.find((n) => n.id === "3")?.collapsed, false)
  assert.equal(edges.length, nodes.length - 1)
  assert.ok(edges.every((e) => ids.includes(e.from) && ids.includes(e.to)))
})

test("ids are stable path ids independent of collapse state", () => {
  const full = new Map(layoutMindMap(map, everything, size).nodes.map((n) => [n.id, n.label]))
  assert.equal(full.get("root"), "Honigbienen")
  assert.equal(full.get("0-0-2"), "Raps und Sonnenblumen")
  assert.equal(full.get("2-1"), "Varroa-Milbe")
  for (const collapsed of states)
    for (const n of layoutMindMap(map, collapsed, size).nodes) assert.equal(full.get(n.id), n.label)
  assert.deepEqual(lineage("2-1-3"), ["root", "2", "2-1", "2-1-3"])
  assert.deepEqual(lineage("root"), ["root"])
})

test("layout is deterministic and contains every node in bounds", () => {
  const a = layoutMindMap(map, new Set(["1"]), size)
  assert.deepEqual(a, layoutMindMap(map, new Set(["1"]), size))
  for (const n of a.nodes) {
    assert.ok(n.x >= a.bounds.x && n.x + n.width <= a.bounds.x + a.bounds.width)
    assert.ok(n.y >= a.bounds.y && n.y + n.height <= a.bounds.y + a.bounds.height)
  }
})

test("a tall parent pushes its short children down instead of overlapping", () => {
  const tall = (item: MindMapItem) => ({ width: 100, height: item.id === "1" ? 120 : 30 })
  const { nodes } = layoutMindMap(map, new Set(["0", "2"]), tall)
  const branch = nodes.find((n) => n.id === "1")!
  const above = nodes.find((n) => n.id === "0")!
  assert.ok(branch.y >= above.y + above.height)
  assert.equal(center(nodes.find((n) => n.id === "1-0")!), center(branch))
})
