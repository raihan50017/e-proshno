/**
 * Utilities for converting between Plain Text (with LaTeX $...$ / $$...$$ math)
 * and TipTap/ProseMirror JSON doc format used by the backend.
 */

interface TipTapTextNode {
  type: 'text'
  text: string
}

interface TipTapMathNode {
  type: 'inlineMath' | 'blockMath'
  attrs: { latex: string }
}

interface TipTapParagraphNode {
  type: 'paragraph'
  content?: Array<TipTapTextNode | TipTapMathNode>
}

export interface TipTapDoc {
  type: 'doc'
  content: Array<TipTapParagraphNode | TipTapMathNode>
}

/**
 * Converts a plain text string (which may contain inline $math$ or block $$math$$)
 * into a valid TipTap JSON doc string.
 */
export function textToTipTapJson(input: string | null | undefined): string {
  if (!input || !input.trim()) {
    return JSON.stringify({ type: 'doc', content: [] })
  }

  const trimmed = input.trim()

  // If already a valid TipTap doc JSON string, return as-is
  if (trimmed.startsWith('{"type":"doc"') || trimmed.startsWith('{"type": "doc"')) {
    try {
      JSON.parse(trimmed)
      return trimmed
    } catch {
      // not valid JSON, proceed with conversion
    }
  }

  const lines = trimmed.replace(/\r\n/g, '\n').split('\n')
  const docContent: Array<TipTapParagraphNode | TipTapMathNode> = []

  for (const line of lines) {
    const trimmedLine = line.trim()
    if (!trimmedLine) continue

    // Block math check: $$...$$
    const blockMathMatch = trimmedLine.match(/^\$\$([\s\S]+?)\$\$$/)
    if (blockMathMatch) {
      docContent.push({
        type: 'blockMath',
        attrs: { latex: blockMathMatch[1].trim() },
      })
      continue
    }

    // Parse inline text and math ($...$)
    const parts = trimmedLine.split(/(\$[^$]+\$)/g)
    const lineContent: Array<TipTapTextNode | TipTapMathNode> = []

    for (const part of parts) {
      if (!part) continue
      if (part.startsWith('$') && part.endsWith('$') && part.length > 2) {
        lineContent.push({
          type: 'inlineMath',
          attrs: { latex: part.slice(1, -1).trim() },
        })
      } else {
        lineContent.push({
          type: 'text',
          text: part,
        })
      }
    }

    docContent.push({
      type: 'paragraph',
      content: lineContent.length > 0 ? lineContent : [{ type: 'text', text: trimmedLine }],
    })
  }

  // If nothing was added, create an empty paragraph
  if (docContent.length === 0) {
    docContent.push({
      type: 'paragraph',
      content: [{ type: 'text', text: trimmed }],
    })
  }

  return JSON.stringify({ type: 'doc', content: docContent })
}

/**
 * Cleans option text by stripping extra $ / $$ signs (e.g. "$F = ma$" -> "F = ma").
 */
export function cleanOptionText(text: string | null | undefined): string {
  if (!text) return ''
  let cleaned = text.trim()

  // Repeatedly strip outer $$...$$ or $...$
  while (
    (cleaned.startsWith('$$') && cleaned.endsWith('$$') && cleaned.length >= 4) ||
    (cleaned.startsWith('$') && cleaned.endsWith('$') && cleaned.length >= 2)
  ) {
    if (cleaned.startsWith('$$') && cleaned.endsWith('$$')) {
      cleaned = cleaned.slice(2, -2).trim()
    } else {
      cleaned = cleaned.slice(1, -1).trim()
    }
  }

  // Also replace any leading/trailing standalone $ signs
  cleaned = cleaned.replace(/^\$+|\$+$/g, '').trim()

  return cleaned
}

/**
 * Extracts human-readable plain text (preserving LaTeX $...$ and $$...$$ syntax by default)
 * from a TipTap doc JSON string or object.
 * When options.stripMathDelimiters is true, returns raw latex without $ or $$ delimiters.
 */
export function tipTapJsonToText(
  input: string | object | null | undefined,
  options?: { stripMathDelimiters?: boolean }
): string {
  if (!input) return ''

  if (typeof input === 'object') {
    return parseNodeToText(input, options?.stripMathDelimiters)
  }

  const trimmed = input.trim()
  if (!trimmed) return ''

  if (trimmed.startsWith('{') && (trimmed.includes('"type"') || trimmed.includes('"content"'))) {
    try {
      const parsed = JSON.parse(trimmed)
      return parseNodeToText(parsed, options?.stripMathDelimiters)
    } catch {
      return trimmed
    }
  }

  return trimmed
}

function parseNodeToText(node: any, stripMathDelimiters: boolean = false): string {
  if (!node) return ''

  switch (node.type) {
    case 'doc': {
      const children = (node.content || [])
        .map((child: any) => parseNodeToText(child, stripMathDelimiters))
        .filter(Boolean)
      return children.join('\n')
    }

    case 'paragraph':
    case 'heading': {
      const children = (node.content || [])
        .map((child: any) => parseNodeToText(child, stripMathDelimiters))
        .join('')
      return children
    }

    case 'text':
      return node.text || ''

    case 'inlineMath':
      return stripMathDelimiters ? (node.attrs?.latex || '') : `$${node.attrs?.latex || ''}$`

    case 'blockMath':
      return stripMathDelimiters ? (node.attrs?.latex || '') : `$$${node.attrs?.latex || ''}$$`

    case 'orderedList': {
      return (node.content || [])
        .map((item: any, idx: number) => `${idx + 1}. ${parseNodeToText(item)}`)
        .join('\n')
    }

    case 'bulletList': {
      return (node.content || [])
        .map((item: any) => `- ${parseNodeToText(item)}`)
        .join('\n')
    }

    case 'listItem': {
      return (node.content || [])
        .map((child: any) => parseNodeToText(child))
        .join(' ')
    }

    default:
      if (node.content && Array.isArray(node.content)) {
        return node.content.map((child: any) => parseNodeToText(child)).join('')
      }
      return node.text || ''
  }
}
