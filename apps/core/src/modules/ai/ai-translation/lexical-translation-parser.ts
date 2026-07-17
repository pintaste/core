/**
 * @file lexical-translation-parser.ts
 * Input: ~/constants/lexical.constant, ~/utils/content.util, ~/utils/lexical-translatable-property.util
 * Output: LexicalTranslationResult, parseLexicalForTranslation, PropertySegment, restoreLexicalTranslation, TranslationSegment
 * Pos: 通用层-lexicaltranslationparser
 *
 * 本注释在文件修改时自动更新，同时触发 FOLDER_INDEX 和 PROJECT_INDEX 更新
 */
// Lexical translation parser: extract translatable segments from serialized JSON.
// Uses blacklist-based skipping + generalized nested editor detection.

import {
  BLOCK_ID_STATE_KEY,
  NODE_STATE_KEY,
} from '~/constants/lexical.constant'
import {
  isNestedLexicalEditorState,
  KNOWN_LEXICAL_STRUCTURAL_PROPS,
  LEXICAL_CONTEXT_EXCALIDRAW_TYPE,
  LEXICAL_CONTEXT_MERMAID_TYPE,
  LEXICAL_CONTEXT_SKIP_BLOCKS,
  LEXICAL_CONTEXT_SKIP_INLINE,
} from '~/utils/content.util'
import { extractLexicalTranslatableProperties } from '~/utils/lexical-translatable-property.util'

import {
  buildCodeCommentPlan,
  joinCodeTokens,
} from './code-comment-translation'

const FORMAT_CODE = 16

/** Temporary plan stashed on code-block nodes during translate/restore. */
const CODE_COMMENT_PLAN_KEY = '__codeCommentPlan'

export interface TranslationSegment {
  id: string
  text: string
  node: any
  translatable: boolean
  blockId: string | null
  rootIndex: number
  flowId: string | null
}

export interface PropertySegment {
  id: string
  text: string
  node: any
  property: string
  key?: string
  blockId: string | null
  rootIndex: number
}

export interface LexicalTranslationResult {
  segments: TranslationSegment[]
  propertySegments: PropertySegment[]
  editorState: any
}

interface BlockContext {
  blockId: string | null
  rootIndex: number
}

const INLINE_FLOW_ROOT_TYPES = new Set([
  'paragraph',
  'heading',
  'quote',
  'rich-quote',
  'listitem',
  'tablecell',
])

function extractExcalidrawTexts(
  node: any,
  propertySegments: PropertySegment[],
  counter: { t: number; p: number },
  ctx: BlockContext,
): void {
  if (!node.snapshot || typeof node.snapshot !== 'string') return
  let parsed: any
  try {
    parsed = JSON.parse(node.snapshot)
  } catch {
    return
  }
  if (!parsed.store || typeof parsed.store !== 'object') return

  let hasSegments = false
  for (const value of Object.values(parsed.store)) {
    const shape = value as any
    if (
      shape?.props?.text &&
      typeof shape.props.text === 'string' &&
      shape.props.text.trim()
    ) {
      propertySegments.push({
        id: `p_${counter.p++}`,
        text: shape.props.text,
        node: shape.props,
        property: 'text',
        blockId: ctx.blockId,
        rootIndex: ctx.rootIndex,
      })
      hasSegments = true
    }
  }

  if (hasSegments) {
    node.__excalidrawParsed = parsed
  }
}

function extractMermaidSegments(
  node: any,
  propertySegments: PropertySegment[],
  counter: { t: number; p: number },
  ctx: BlockContext,
): void {
  if (typeof node.diagram !== 'string' || !node.diagram.trim()) return
  propertySegments.push({
    id: `p_${counter.p++}`,
    text: node.diagram,
    node,
    property: 'diagram',
    blockId: ctx.blockId,
    rootIndex: ctx.rootIndex,
  })
}

function extractPollSegments(
  node: any,
  propertySegments: PropertySegment[],
  counter: { t: number; p: number },
  ctx: BlockContext,
): void {
  if (typeof node.question === 'string' && node.question.trim()) {
    propertySegments.push({
      id: `p_${counter.p++}`,
      text: node.question,
      node,
      property: 'question',
      blockId: ctx.blockId,
      rootIndex: ctx.rootIndex,
    })
  }
  if (Array.isArray(node.options)) {
    for (const option of node.options) {
      if (typeof option.label === 'string' && option.label.trim()) {
        propertySegments.push({
          id: `p_${counter.p++}`,
          text: option.label,
          node: option,
          property: 'label',
          blockId: ctx.blockId,
          rootIndex: ctx.rootIndex,
        })
      }
    }
  }
}

/**
 * Decorator code-block nodes store source in `code` (not children).
 * Extract only natural-language comments so they get translated while
 * identifiers / commands stay untouched.
 */
function extractCodeBlockCommentSegments(
  node: any,
  propertySegments: PropertySegment[],
  counter: { t: number; p: number },
  ctx: BlockContext,
): void {
  if (typeof node.code !== 'string' || !node.code.trim()) return

  const plan = buildCodeCommentPlan(node.code)
  if (!plan) return

  node[CODE_COMMENT_PLAN_KEY] = plan
  for (const token of plan.tokens) {
    if (!token.isComment) continue
    // Tag so strategy meta resolves to `code.comment`
    ;(token as any).__isCodeComment = true
    propertySegments.push({
      id: `p_${counter.p++}`,
      text: token.value,
      node: token,
      property: 'value',
      blockId: ctx.blockId,
      rootIndex: ctx.rootIndex,
    })
  }
}

function restoreCodeBlockComments(node: any): void {
  const plan = node?.[CODE_COMMENT_PLAN_KEY] as
    | { tokens: Array<{ value: string }> }
    | undefined
  if (!plan?.tokens?.length) return
  node.code = joinCodeTokens(plan.tokens as any)
  delete node[CODE_COMMENT_PLAN_KEY]
}

// Registry for node types whose translatable text lives in an opaque payload
// rather than children/whitelisted properties. `extract` replaces the normal
// walk for that node; `restore` runs over the whole tree after translations
// are applied (e.g. re-stringifying a parsed snapshot). Adding a new complex
// node type means adding one entry here — the walker and the restorer pick
// it up automatically.
interface ComplexNodeExtractor {
  extract: (
    node: any,
    propertySegments: PropertySegment[],
    counter: { t: number; p: number },
    ctx: BlockContext,
  ) => void
  restore?: (node: any) => void
}

const CODE_BLOCK_EXTRACTOR: ComplexNodeExtractor = {
  extract: extractCodeBlockCommentSegments,
  restore: restoreCodeBlockComments,
}

const COMPLEX_NODE_EXTRACTORS: Record<string, ComplexNodeExtractor> = {
  [LEXICAL_CONTEXT_EXCALIDRAW_TYPE]: {
    extract: extractExcalidrawTexts,
    restore: (node) => {
      if (node.__excalidrawParsed) {
        node.snapshot = JSON.stringify(node.__excalidrawParsed)
        delete node.__excalidrawParsed
      }
    },
  },
  [LEXICAL_CONTEXT_MERMAID_TYPE]: { extract: extractMermaidSegments },
  poll: { extract: extractPollSegments },
  // Decorator code blocks (blog / Yohaku): { type: 'code-block', code: '...' }
  'code-block': CODE_BLOCK_EXTRACTOR,
  // Legacy / test shape may use type 'code' with a `code` string property
  code: CODE_BLOCK_EXTRACTOR,
}

function walkNode(
  node: any,
  segments: TranslationSegment[],
  propertySegments: PropertySegment[],
  counter: { t: number; p: number; f: number },
  ctx: BlockContext,
  currentFlowId: string | null,
): void {
  if (!node) return

  const complexExtractor = COMPLEX_NODE_EXTRACTORS[node.type]
  if (complexExtractor) {
    complexExtractor.extract(node, propertySegments, counter, ctx)
    return
  }

  if (LEXICAL_CONTEXT_SKIP_BLOCKS.has(node.type)) return
  if (LEXICAL_CONTEXT_SKIP_INLINE.has(node.type)) return

  for (const property of extractLexicalTranslatableProperties(node)) {
    propertySegments.push({
      id: `p_${counter.p++}`,
      text: property.text,
      node,
      property: property.property,
      key: property.key,
      blockId: ctx.blockId,
      rootIndex: ctx.rootIndex,
    })
  }

  const nextFlowId =
    currentFlowId ??
    (INLINE_FLOW_ROOT_TYPES.has(node.type) ? `f_${counter.f++}` : null)

  // Text leaf
  if (node.type === 'text') {
    if (node.text?.trim()) {
      segments.push({
        id: `t_${counter.t++}`,
        text: node.text,
        node,
        translatable: !(node.format & FORMAT_CODE),
        blockId: ctx.blockId,
        rootIndex: ctx.rootIndex,
        flowId: nextFlowId,
      })
    }
    return
  }

  // Recurse children first (main content order)
  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      walkNode(child, segments, propertySegments, counter, ctx, nextFlowId)
    }
  }

  // Then scan nested editor states (fixed traversal order)
  scanNestedEditorStates(node, segments, propertySegments, counter, ctx)
}

function scanNestedEditorStates(
  node: any,
  segments: TranslationSegment[],
  propertySegments: PropertySegment[],
  counter: { t: number; p: number; f: number },
  ctx: BlockContext,
): void {
  for (const [propName, propValue] of Object.entries(node)) {
    if (KNOWN_LEXICAL_STRUCTURAL_PROPS.has(propName)) continue

    // Single nested editor state: { root: { children: [...] } }
    if (isNestedLexicalEditorState(propValue)) {
      for (const child of propValue.root.children) {
        walkNode(child, segments, propertySegments, counter, ctx, null)
      }
      continue
    }

    // Array of nested editor states
    if (Array.isArray(propValue)) {
      for (const item of propValue) {
        if (isNestedLexicalEditorState(item)) {
          for (const child of item.root.children) {
            walkNode(child, segments, propertySegments, counter, ctx, null)
          }
        }
      }
    }
  }
}

// ── Parser ──

function readBlockId(node: any): string | null {
  const state = node?.[NODE_STATE_KEY]
  if (!state || typeof state !== 'object' || Array.isArray(state)) return null
  const blockId = state[BLOCK_ID_STATE_KEY]
  return typeof blockId === 'string' && blockId.trim() ? blockId.trim() : null
}

export function parseLexicalForTranslation(
  editorStateJson: string,
): LexicalTranslationResult {
  const editorState = JSON.parse(editorStateJson)
  const rootChildren: any[] = editorState.root?.children ?? []

  const segments: TranslationSegment[] = []
  const propertySegments: PropertySegment[] = []
  const counter = { t: 0, p: 0, f: 0 }

  for (let i = 0; i < rootChildren.length; i++) {
    const child = rootChildren[i]
    const ctx: BlockContext = {
      blockId: readBlockId(child),
      rootIndex: i,
    }
    walkNode(child, segments, propertySegments, counter, ctx, null)
  }

  return { segments, propertySegments, editorState }
}

// ── Restorer ──

function applyComplexNodeRestoreHooks(node: any): void {
  if (!node) return
  COMPLEX_NODE_EXTRACTORS[node.type]?.restore?.(node)
  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      applyComplexNodeRestoreHooks(child)
    }
  }
  // Scan nested editor states
  for (const [key, val] of Object.entries(node)) {
    if (
      key === 'children' ||
      key === '__excalidrawParsed' ||
      key === 'snapshot'
    )
      continue
    if (
      val &&
      typeof val === 'object' &&
      !Array.isArray(val) &&
      (val as any).root?.children
    ) {
      for (const child of (val as any).root.children) {
        applyComplexNodeRestoreHooks(child)
      }
    }
    if (Array.isArray(val)) {
      for (const item of val) {
        if (item?.root?.children) {
          for (const child of item.root.children) {
            applyComplexNodeRestoreHooks(child)
          }
        }
      }
    }
  }
}

export function restoreLexicalTranslation(
  result: LexicalTranslationResult,
  translations: Map<string, string>,
): string {
  for (const seg of result.segments) {
    if (seg.translatable) {
      seg.node.text = translations.get(seg.id) ?? seg.text
    }
  }
  for (const prop of result.propertySegments) {
    const translated = translations.get(prop.id) ?? prop.text
    if (prop.key !== undefined) {
      prop.node[prop.property][prop.key] = translated
    } else {
      prop.node[prop.property] = translated
    }
  }

  // Run registry restore hooks (e.g. re-stringify excalidraw snapshots)
  applyComplexNodeRestoreHooks(result.editorState.root)

  return JSON.stringify(result.editorState)
}
