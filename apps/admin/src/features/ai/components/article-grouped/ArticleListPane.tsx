import { AlertCircle, Inbox, Loader2 } from 'lucide-react'
import { useEffect, useRef } from 'react'

import type { ArticleInfo } from '~/api/ai'
import { useI18n } from '~/i18n'
import { FocusScope } from '~/ui/focus-scope'
import { MobileHeaderAffordance } from '~/ui/layout/mobile-header-affordance'
import type { HeaderAction } from '~/ui/layout/page-layout'
import { HeaderActions } from '~/ui/layout/page-layout'
import { useListKeyboard } from '~/ui/list-actions'
import { Scroll } from '~/ui/primitives/scroll'
import { cn } from '~/utils/cn'

import { ArticleListRow } from './ArticleListRow'
import { BorderlessSearchInput } from './BorderlessSearchInput'
import type { ArticleGroup, ArticleGroupedConfig } from './types'

export type ArticleListFilter = 'all' | 'generated' | 'notGenerated'

interface ArticleListPaneProps<TItem> {
  config: ArticleGroupedConfig<TItem>
  search: string
  onSearchChange: (value: string) => void
  groups: ArticleGroup<TItem>[]
  selectedArticleId: string | null
  onSelectArticle: (article: ArticleInfo) => void
  isLoading: boolean
  isError?: boolean
  hasNextPage: boolean
  isFetchingNextPage: boolean
  onLoadMore: () => void
  actions?: HeaderAction[]
  filter?: {
    value: ArticleListFilter
    onChange: (value: ArticleListFilter) => void
  }
}

const FILTER_OPTIONS: Array<{
  value: ArticleListFilter
  labelKey: 'ai.articleGrouped.filterAll' | 'ai.articleGrouped.filterGenerated' | 'ai.articleGrouped.filterNotYet'
}> = [
  { value: 'all', labelKey: 'ai.articleGrouped.filterAll' },
  { value: 'generated', labelKey: 'ai.articleGrouped.filterGenerated' },
  { value: 'notGenerated', labelKey: 'ai.articleGrouped.filterNotYet' },
]

export function ArticleListPane<TItem>(props: ArticleListPaneProps<TItem>) {
  const { t } = useI18n()
  const scopeId = `${props.config.scopeIdPrefix}-articles`
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  const articles = props.groups.map((group) => group.article)

  useListKeyboard<ArticleInfo>({
    scopeId,
    items: articles,
    getId: (article) => article.id,
    resetOn: [props.search],
    onItemFocus: (id) => {
      const article = articles.find((a) => a.id === id)
      if (article) props.onSelectArticle(article)
    },
    actions: [
      {
        key: 'open',
        label: 'Open',
        shortcut: 'Enter',
        run: (targets) => {
          const target = targets[0]
          if (target) props.onSelectArticle(target)
        },
      },
    ],
  })

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return
    if (!props.hasNextPage) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (
          entries.some((entry) => entry.isIntersecting) &&
          !props.isFetchingNextPage
        ) {
          props.onLoadMore()
        }
      },
      { root: scrollRef.current, rootMargin: '240px' },
    )

    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [props.hasNextPage, props.isFetchingNextPage, props.onLoadMore])

  const empty = !props.isLoading && props.groups.length === 0
  const hasSearch = props.search.trim().length > 0
  const activeFilter = props.filter?.value ?? 'all'

  const emptyTitle = (() => {
    if (props.isError) return t('ai.articleGrouped.loadErrorTitle')
    if (hasSearch) return t('ai.articleGrouped.searchEmptyTitle')
    if (activeFilter === 'generated') return t('ai.articleGrouped.filterEmptyGenerated', { kind: t(props.config.kindKey) })
    if (activeFilter === 'notGenerated') return t('ai.articleGrouped.filterEmptyNotYet', { kind: t(props.config.kindKey) })
    return t(props.config.emptyTitleKey, { kind: t(props.config.kindKey) })
  })()

  const emptyDescription = (() => {
    if (props.isError) return t('ai.articleGrouped.loadError')
    if (hasSearch) return t('ai.articleGrouped.searchEmptyHint')
    if (activeFilter === 'generated') return t('ai.articleGrouped.filterEmptyGeneratedHint')
    if (activeFilter === 'notGenerated') return t('ai.articleGrouped.filterEmptyNotYetHint')
    return t(props.config.emptyDescriptionKey)
  })()

  return (
    <FocusScope
      className={cn('outline-hidden flex h-full min-h-0 flex-col')}
      id={scopeId}
    >
      <div className="flex h-12 shrink-0 items-center gap-1 border-b border-border pl-1 pr-2">
        <MobileHeaderAffordance />
        <BorderlessSearchInput
          ariaLabel={t(props.config.searchPlaceholderKey)}
          onChange={props.onSearchChange}
          placeholder={t(props.config.searchPlaceholderKey)}
          value={props.search}
        />
        {props.actions?.length ? (
          <HeaderActions actions={props.actions} />
        ) : null}
      </div>

      {props.filter && (
        <div className="flex h-9 shrink-0 items-center gap-1 border-b border-border px-3">
          {FILTER_OPTIONS.map((opt) => (
            <button
              className={cn(
                'rounded px-2 py-0.5 text-xs font-medium transition-colors',
                props.filter!.value === opt.value
                  ? 'bg-accent/15 text-accent'
                  : 'text-fg-subtle hover:text-fg hover:bg-surface-inset',
              )}
              key={opt.value}
              onClick={() => props.filter!.onChange(opt.value)}
              type="button"
            >
              {t(opt.labelKey)}
            </button>
          ))}
        </div>
      )}

      <Scroll className="flex-1" ref={scrollRef}>
        {empty ? (
          <ListEmpty
            description={emptyDescription}
            isError={props.isError}
            title={emptyTitle}
          />
        ) : (
          <>
            {props.groups.map((group) => (
              <ArticleListRow
                article={group.article}
                isDetailTarget={props.selectedArticleId === group.article.id}
                itemCount={group.items.length}
                itemCountKey={props.config.itemCountKey}
                key={`${group.article.type}-${group.article.id}`}
                onSelect={() => props.onSelectArticle(group.article)}
                selected={props.selectedArticleId === group.article.id}
              />
            ))}
            {props.hasNextPage ? (
              <div
                className="flex items-center justify-center py-3"
                ref={sentinelRef}
              >
                {props.isFetchingNextPage ? (
                  <Loader2
                    aria-hidden="true"
                    className="size-4 animate-spin text-fg-subtle"
                  />
                ) : null}
              </div>
            ) : null}
          </>
        )}
      </Scroll>
    </FocusScope>
  )
}

function ListEmpty(props: { title: string; description: string; isError?: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-16 text-center">
      {props.isError ? (
        <AlertCircle aria-hidden="true" className="size-8 text-red-400" />
      ) : (
        <Inbox aria-hidden="true" className="size-8 text-fg-subtle" />
      )}
      <p className="text-sm font-medium text-fg">{props.title}</p>
      <p className="text-xs text-fg-muted">{props.description}</p>
    </div>
  )
}
