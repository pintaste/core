import { describe, expect, it } from 'vitest'

import {
  buildCodeCommentPlan,
  joinCodeTokens,
  tokenizeCodeComments,
} from '~/modules/ai/ai-translation/code-comment-translation'
import {
  parseLexicalForTranslation,
  restoreLexicalTranslation,
} from '~/modules/ai/ai-translation/lexical-translation-parser'

describe('code-comment-translation', () => {
  it('tokenizes full-line and trailing # comments', () => {
    const code = [
      'gas sw          # rotate next',
      '# full line note',
      'echo hi',
      '',
    ].join('\n')

    const tokens = tokenizeCodeComments(code)
    const comments = tokens.filter((t) => t.isComment).map((t) => t.value)
    expect(comments).toEqual(['rotate next', 'full line note'])
    expect(joinCodeTokens(tokens)).toBe(code)
  })

  it('tokenizes // and -- markers', () => {
    const code = 'const x = 1 // trailing\n-- sql note\nSELECT 1'
    const comments = tokenizeCodeComments(code)
      .filter((t) => t.isComment)
      .map((t) => t.value)
    expect(comments).toEqual(['trailing', 'sql note'])
  })

  it('skips non-prose tokens and shebang', () => {
    const code = '#!/usr/bin/env bash\necho ok #x\n#\n'
    const plan = buildCodeCommentPlan(code)
    expect(plan).toBeNull()
  })

  it('treats CJK trailing comments as prose', () => {
    const code = 'gas sw          # 轮转到下一个账号\n'
    const plan = buildCodeCommentPlan(code)
    expect(plan).not.toBeNull()
    const comments = plan!.tokens.filter((t) => t.isComment)
    expect(comments).toHaveLength(1)
    expect(comments[0].value).toBe('轮转到下一个账号')
  })
})

describe('lexical parser code-block comments', () => {
  const makeEditorState = (children: any[]) =>
    JSON.stringify({ root: { children, type: 'root', direction: 'ltr' } })

  it('extracts comments from code-block.code and restores them', () => {
    const code =
      'gas sw          # 轮转到下一个账号\ngas to 1               # 按编号\n'
    const json = makeEditorState([
      {
        type: 'code-block',
        code,
        language: 'bash',
        version: 1,
      },
      {
        type: 'paragraph',
        children: [
          {
            type: 'text',
            text: 'After',
            format: 0,
            detail: 0,
            mode: 'normal',
            style: '',
          },
        ],
      },
    ])

    const parsed = parseLexicalForTranslation(json)
    expect(parsed.segments.map((s) => s.text)).toEqual(['After'])
    expect(parsed.propertySegments).toHaveLength(2)
    expect(parsed.propertySegments.map((p) => p.text)).toEqual([
      '轮转到下一个账号',
      '按编号',
    ])

    const translations = new Map<string, string>([
      [parsed.propertySegments[0].id, '次のアカウントへ'],
      [parsed.propertySegments[1].id, '番号指定'],
      [parsed.segments[0].id, 'After'],
    ])
    const restored = JSON.parse(
      restoreLexicalTranslation(parsed, translations),
    )
    const block = restored.root.children[0]
    expect(block.type).toBe('code-block')
    expect(block.code).toContain('次のアカウントへ')
    expect(block.code).toContain('番号指定')
    expect(block.code).not.toContain('轮转')
    expect(block.code).toMatch(/^gas sw\s+# 次のアカウントへ\n/)
    // no plan leakage
    expect(block.__codeCommentPlan).toBeUndefined()
  })

  it('leaves pure code blocks without comments unextracted', () => {
    const json = makeEditorState([
      {
        type: 'code-block',
        code: 'echo hi\nls -la\n',
        language: 'bash',
        version: 1,
      },
    ])
    const parsed = parseLexicalForTranslation(json)
    expect(parsed.propertySegments).toHaveLength(0)
    expect(parsed.segments).toHaveLength(0)
  })
})
