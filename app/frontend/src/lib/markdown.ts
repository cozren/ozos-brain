// Self-contained remark plugin: turn soft newlines (a single Enter) into hard
// <br> breaks so text renders the way it was typed. Avoids a remark-breaks dep.
export function remarkLineBreaks() {
  const walk = (node: any) => {
    if (!node.children) return
    const out: any[] = []
    for (const child of node.children) {
      if (child.type === 'text' && typeof child.value === 'string' && child.value.includes('\n')) {
        child.value.split('\n').forEach((part: string, idx: number) => {
          if (idx > 0) out.push({ type: 'break' })
          if (part) out.push({ type: 'text', value: part })
        })
      } else {
        walk(child)
        out.push(child)
      }
    }
    node.children = out
  }
  return (tree: any) => {
    walk(tree)
    return tree
  }
}

// Self-contained rehype plugin: nest each heading and the content beneath it
// (up to the next same-or-higher-level heading) into a
// <section class="km-section"> wrapping [heading, <div class="km-section-body">…]].
// Recurses so deeper headings nest inside their parent's body, letting the
// preview render collapsible heading sections. Operates on the parsed HTML tree,
// so a "#" line inside a code block is never mistaken for a heading.
const HEADING_LEVEL: Record<string, number> = { h1: 1, h2: 2, h3: 3, h4: 4, h5: 5, h6: 6 }

function headingLevel(node: any): number | undefined {
  return node?.type === 'element' ? HEADING_LEVEL[node.tagName] : undefined
}

function sectionize(nodes: any[]): any[] {
  const out: any[] = []
  let i = 0
  while (i < nodes.length) {
    const node = nodes[i]
    const level = headingLevel(node)
    if (level) {
      const body: any[] = []
      let j = i + 1
      while (j < nodes.length) {
        const l = headingLevel(nodes[j])
        if (l && l <= level) break
        body.push(nodes[j])
        j++
      }
      out.push({
        type: 'element',
        tagName: 'section',
        properties: { className: ['km-section'] },
        children: [
          node,
          {
            type: 'element',
            tagName: 'div',
            properties: { className: ['km-section-body'] },
            children: sectionize(body),
          },
        ],
      })
      i = j
    } else {
      out.push(node)
      i++
    }
  }
  return out
}

export function rehypeCollapsibleSections() {
  return (tree: any) => {
    tree.children = sectionize(tree.children)
    return tree
  }
}
