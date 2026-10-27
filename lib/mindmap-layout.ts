import type { MindMap } from "@/lib/studio"

export type Size = { width: number; height: number }

export type MindMapItem = {
  id: string
  label: string
  depth: number
  branch: number
  parent?: string
  children: string[]
}

export type LayoutNode = MindMapItem & Size & { x: number; y: number; collapsed: boolean }

export type LayoutEdge = { from: string; to: string; branch: number }

export type MindMapLayout = {
  nodes: LayoutNode[]
  edges: LayoutEdge[]
  bounds: { x: number; y: number; width: number; height: number }
}

const GAP_X = [72, 52, 40]
const GAP_Y = [0, 16, 8, 5]

export function flattenMindMap(data: MindMap): MindMapItem[] {
  return [
    { id: "root", label: data.title, depth: 0, branch: -1, children: data.branches.map((_, i) => `${i}`) },
    ...data.branches.flatMap((branch, i) => [
      { id: `${i}`, label: branch.title, depth: 1, branch: i, parent: "root", children: branch.children.map((_, j) => `${i}-${j}`) },
      ...branch.children.flatMap((child, j) => [
        {
          id: `${i}-${j}`,
          label: child.title,
          depth: 2,
          branch: i,
          parent: `${i}`,
          children: child.children.map((_, k) => `${i}-${j}-${k}`),
        },
        ...child.children.map((leaf, k) => ({ id: `${i}-${j}-${k}`, label: leaf, depth: 3, branch: i, parent: `${i}-${j}`, children: [] })),
      ]),
    ]),
  ]
}

export function lineage(id: string) {
  return id === "root" ? ["root"] : ["root", ...id.split("-").map((_, i, parts) => parts.slice(0, i + 1).join("-"))]
}

export function layoutMindMap(
  data: MindMap,
  collapsed: ReadonlySet<string>,
  size: (item: MindMapItem) => Size
): MindMapLayout {
  const items = new Map(flattenMindMap(data).map((item) => [item.id, item]))
  const open = (item: MindMapItem) => item.children.length > 0 && !collapsed.has(item.id)

  const place = (item: MindMapItem, x: number): { nodes: LayoutNode[]; height: number; mid: number } => {
    const node: LayoutNode = { ...item, ...size(item), x, y: 0, collapsed: item.children.length > 0 && !open(item) }
    if (!open(item)) return { nodes: [node], height: node.height, mid: node.height / 2 }

    const kids = item.children.map((id) => items.get(id)!)
    const subtrees = kids.map((kid) => place(kid, x + node.width + GAP_X[item.depth]))
    const offsets: number[] = []
    let cursor = 0
    subtrees.forEach((subtree, i) => {
      if (i) cursor += GAP_Y[item.depth + 1] * (open(kids[i - 1]) || open(kids[i]) ? 2 : 1)
      offsets.push(cursor)
      cursor += subtree.height
    })
    const last = subtrees.length - 1
    const mid = (offsets[0] + subtrees[0].mid + offsets[last] + subtrees[last].mid) / 2
    const shift = Math.max(0, node.height / 2 - mid)
    node.y = mid + shift - node.height / 2
    subtrees.forEach((subtree, i) => subtree.nodes.forEach((n) => (n.y += offsets[i] + shift)))
    return {
      nodes: [node, ...subtrees.flatMap((subtree) => subtree.nodes)],
      height: Math.max(cursor + shift, node.y + node.height),
      mid: mid + shift,
    }
  }

  const { nodes, height } = place(items.get("root")!, 0)
  return {
    nodes,
    edges: nodes.flatMap((n) => (n.parent ? [{ from: n.parent, to: n.id, branch: n.branch }] : [])),
    bounds: { x: 0, y: 0, width: Math.max(...nodes.map((n) => n.x + n.width)), height },
  }
}
