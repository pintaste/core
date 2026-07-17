import type { FormEvent } from 'react'
import { useState } from 'react'

import { useI18n } from '~/i18n'
import { ModalFooter, ModalHeader } from '~/ui/feedback/modal'
import { present, useModal } from '~/ui/feedback/modal-imperative'
import { Button } from '~/ui/primitives/button'
import { Combobox } from '~/ui/primitives/combobox'

export interface GeneratePromptModalProps {
  title: string
  promptForLang: boolean
  langLabel: string
  inlineEmpty?: string
}

export interface GeneratePromptResult {
  lang?: string
}

const LANGUAGES = [
  { code: 'zh', label: '中文' },
  { code: 'en', label: 'English' },
  { code: 'ja', label: '日本語' },
  { code: 'ko', label: '한국어' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
  { code: 'es', label: 'Español' },
  { code: 'pt', label: 'Português' },
  { code: 'ru', label: 'Русский' },
  { code: 'it', label: 'Italiano' },
  { code: 'ar', label: 'العربية' },
  { code: 'nl', label: 'Nederlands' },
  { code: 'tr', label: 'Türkçe' },
  { code: 'vi', label: 'Tiếng Việt' },
  { code: 'th', label: 'ภาษาไทย' },
  { code: 'id', label: 'Bahasa Indonesia' },
] as const

function GeneratePromptModal(props: GeneratePromptModalProps) {
  const { t } = useI18n()
  const modal = useModal<GeneratePromptResult>()
  const [lang, setLang] = useState('zh')

  const handleSubmit = (event?: FormEvent) => {
    event?.preventDefault()
    if (props.promptForLang) {
      if (!lang.trim()) return
      modal.close({ lang: lang.trim().toLowerCase() })
    } else {
      modal.close({})
    }
  }

  return (
    <form className="flex w-full flex-col" onSubmit={handleSubmit}>
      <ModalHeader title={props.title} />
      <div className="space-y-4 px-5 py-4">
        {props.promptForLang ? (
          <div>
            <label className="mb-1.5 block text-sm font-medium text-fg">
              {props.langLabel}
            </label>
            <Combobox
              value={lang}
              onValueChange={(v) => {
                if (v) setLang(v)
              }}
            >
              <Combobox.Control>
                <Combobox.Input autoFocus placeholder={t('ai.translation.langSearch')} />
                <Combobox.Trigger />
              </Combobox.Control>
              <Combobox.Content>
                <Combobox.List>
                  {LANGUAGES.map((option) => (
                    <Combobox.Item key={option.code} value={option.code}>
                      {option.label}
                      <span className="ml-1.5 text-xs text-fg-subtle">
                        ({option.code})
                      </span>
                    </Combobox.Item>
                  ))}
                </Combobox.List>
                <Combobox.Empty>{t('common.empty')}</Combobox.Empty>
              </Combobox.Content>
            </Combobox>
          </div>
        ) : (
          <p className="text-sm text-fg-muted">
            {props.inlineEmpty ?? props.title}
          </p>
        )}
      </div>
      <ModalFooter>
        <Button onClick={() => modal.dismiss()} type="button" variant="subtle">
          {t('common.cancel')}
        </Button>
        <Button type="submit" variant="primary">
          {props.title}
        </Button>
      </ModalFooter>
    </form>
  )
}

export async function presentGeneratePrompt(
  props: GeneratePromptModalProps,
): Promise<GeneratePromptResult | undefined> {
  const handle = present<GeneratePromptModalProps, GeneratePromptResult>(
    GeneratePromptModal,
    props,
    { modalProps: { popupStyle: { width: 'min(92vw, 28rem)' } } },
  )
  return await handle
}
