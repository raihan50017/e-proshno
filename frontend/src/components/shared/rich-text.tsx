import * as React from 'react'
import katex from 'katex'

interface RichTextProps {
  content?: string | null | Record<string, any>
  className?: string
}

function renderMath(latex: string, displayMode: boolean = false): string {
  try {
    return katex.renderToString(latex.trim(), {
      displayMode,
      throwOnError: false,
    })
  } catch {
    return latex
  }
}

/**
 * Renders inline math like $...$ inside a text string
 */
function renderInlineMathString(text: string): React.ReactNode[] {
  if (!text) return []
  const parts = text.split(/(\$[^$]+\$)/g)
  return parts.map((part, index) => {
    if (part.startsWith('$') && part.endsWith('$') && part.length > 2) {
      const latex = part.slice(1, -1)
      const html = renderMath(latex, false)
      return (
        <span
          key={index}
          className="inline-math"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      )
    }
    return <React.Fragment key={index}>{part}</React.Fragment>
  })
}

function renderTipTapNode(node: any, key: string | number): React.ReactNode {
  if (!node) return null

  switch (node.type) {
    case 'doc':
      return (
        <div key={key} className="tiptap-doc space-y-1">
          {(node.content || []).map((child: any, idx: number) =>
            renderTipTapNode(child, `${key}-${idx}`)
          )}
        </div>
      )

    case 'paragraph':
      return (
        <p key={key} className="tiptap-paragraph inline leading-relaxed">
          {(node.content || []).map((child: any, idx: number) =>
            renderTipTapNode(child, `${key}-${idx}`)
          )}
        </p>
      )

    case 'text': {
      let contentNode: React.ReactNode = renderInlineMathString(node.text || '')
      if (node.marks) {
        for (const mark of node.marks) {
          if (mark.type === 'bold') {
            contentNode = <strong>{contentNode}</strong>
          } else if (mark.type === 'italic') {
            contentNode = <em>{contentNode}</em>
          } else if (mark.type === 'underline') {
            contentNode = <u>{contentNode}</u>
          }
        }
      }
      return <React.Fragment key={key}>{contentNode}</React.Fragment>
    }

    case 'inlineMath': {
      const latex = node.attrs?.latex || ''
      const html = renderMath(latex, false)
      return (
        <span
          key={key}
          className="inline-math px-0.5"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      )
    }

    case 'blockMath': {
      const latex = node.attrs?.latex || ''
      const html = renderMath(latex, true)
      return (
        <div
          key={key}
          className="block-math my-1 text-center"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      )
    }

    default:
      if (node.content) {
        return (
          <span key={key}>
            {node.content.map((child: any, idx: number) =>
              renderTipTapNode(child, `${key}-${idx}`)
            )}
          </span>
        )
      }
      return null
  }
}

export function RichText({ content, className }: RichTextProps) {
  if (!content) return null

  // If already an object (TipTap JSON)
  if (typeof content === 'object') {
    return <div className={className}>{renderTipTapNode(content, 'root')}</div>
  }

  // If string, check if it's TipTap JSON format
  if (typeof content === 'string') {
    const trimmed = content.trim()
    if (trimmed.startsWith('{"type"') || trimmed.startsWith('{"content"')) {
      try {
        const parsed = JSON.parse(trimmed)
        return <div className={className}>{renderTipTapNode(parsed, 'root')}</div>
      } catch {
        // fall back to string rendering
      }
    }

    return (
      <div className={className}>
        {renderInlineMathString(trimmed)}
      </div>
    )
  }

  return <span className={className}>{String(content)}</span>
}

