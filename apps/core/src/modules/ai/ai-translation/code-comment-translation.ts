/**
 * Extract / restore natural-language comments inside code-block `code` strings
 * so AI translation can localize comments without rewriting code.
 */

export type CodeToken = {
  /** raw slice of the original source (code or comment body) */
  value: string
  /** true when this token is a comment body eligible for translation */
  isComment: boolean
  /** marker used only for debugging / meta */
  marker?: string
}

export type CodeCommentPlan = {
  tokens: CodeToken[]
}

const FULL_LINE_COMMENT_RE =
  /^(\s*)(#(?!!)|\/\/|--|;)(\s?)(.*)$/

/**
 * Trailing comment: require whitespace before the marker so we don't treat
 * `foo#bar` or URLs as comments. Prefer // then # then -- then ;.
 */
const TRAILING_COMMENT_RE =
  /^(.*?)([ \t]+)(\/\/|#|--|;)(\s?)(.*)$/

/** Comment bodies that look like machine tokens, not prose. */
function isProseComment(body: string): boolean {
  const text = body.trim()
  if (!text) return false
  // Must contain a letter / CJK / digit
  if (!/[\p{L}\p{N}]/u.test(text)) return false
  // Pure short identifiers / paths stay as-is
  if (/^[A-Za-z0-9_./\\:+@%?=*-]+$/.test(text) && text.length < 24) {
    return false
  }
  // CJK almost always prose in our blogs
  if (/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/.test(text)) return true
  // Multi-word English / spaced prose
  if (/\s/.test(text)) return true
  // Longer single token word
  return text.length >= 6 && /[A-Za-z]/.test(text)
}

function splitTrailing(line: string): {
  prefix: string
  marker: string
  gap: string
  body: string
} | null {
  const m = line.match(TRAILING_COMMENT_RE)
  if (!m) return null
  const [, codePart, ws, marker, gap, body] = m
  // Don't treat shebang leftovers or empty bodies as comments
  if (!body.trim()) return null
  // If the "code" part has an unclosed single/double quote, marker is likely inside a string
  const singles = (codePart.match(/(?<!\\)'/g) || []).length
  const doubles = (codePart.match(/(?<!\\)"/g) || []).length
  if (singles % 2 === 1 || doubles % 2 === 1) return null
  if (!isProseComment(body)) return null
  return {
    prefix: codePart + ws + marker + gap,
    marker,
    gap,
    body,
  }
}

/**
 * Tokenize source code into alternating code / comment-body tokens.
 * Comment markers stay on the code token so the model only sees prose.
 */
export function tokenizeCodeComments(code: string): CodeToken[] {
  if (!code) return []
  const lines = code.split('\n')
  const tokens: CodeToken[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const newline = i < lines.length - 1 ? '\n' : ''

    const full = line.match(FULL_LINE_COMMENT_RE)
    if (full) {
      const [, indent, marker, gap, body] = full
      if (isProseComment(body)) {
        tokens.push({
          value: indent + marker + gap,
          isComment: false,
          marker,
        })
        tokens.push({ value: body, isComment: true, marker })
        if (newline) tokens.push({ value: newline, isComment: false })
        continue
      }
    }

    const trailing = splitTrailing(line)
    if (trailing) {
      tokens.push({
        value: trailing.prefix,
        isComment: false,
        marker: trailing.marker,
      })
      tokens.push({
        value: trailing.body,
        isComment: true,
        marker: trailing.marker,
      })
      if (newline) tokens.push({ value: newline, isComment: false })
      continue
    }

    tokens.push({ value: line + newline, isComment: false })
  }

  return tokens
}

export function joinCodeTokens(tokens: CodeToken[]): string {
  return tokens.map((t) => t.value).join('')
}

export function buildCodeCommentPlan(code: string): CodeCommentPlan | null {
  const tokens = tokenizeCodeComments(code)
  if (!tokens.some((t) => t.isComment)) return null
  return { tokens }
}
