'use client'

import { useState } from 'react'
import { isRussian } from '@/lib/language'
import type { Prospect } from '@/lib/types'
import type { Status } from '@/lib/status'
import { STATUSES } from '@/lib/status'

const HEAT_LABEL = { hot: 'Горячий', warm: 'Тёплый', cold: 'Холодный' } as const

/** Золото — знак горячего. Тёплый глушим, холодный уводим в серый. */
const HEAT_TEXT = {
  hot: 'text-goldink',
  warm: 'text-golddim',
  cold: 'text-muted',
} as const

const HEAT_EDGE = {
  hot: 'before:bg-gold',
  warm: 'before:bg-golddim',
  cold: 'before:bg-rule',
} as const

function ago(iso: string): string {
  const days = Math.floor((Date.now() - +new Date(iso)) / 86_400_000)
  if (days <= 0) return 'сегодня'
  if (days === 1) return 'вчера'
  if (days < 7) return `${days} дн. назад`
  if (days < 30) return `${Math.floor(days / 7)} нед. назад`
  return `${Math.floor(days / 30)} мес. назад`
}

export function ProspectCard({
  p,
  status,
  translation,
  translating,
  onStatus,
}: {
  p: Prospect
  status: Status
  translation?: string
  translating: boolean
  onStatus: (s: Status) => void
}) {
  const [copied, setCopied] = useState(false)
  const [opened, setOpened] = useState(false)
  const dimmed = status === 'rejected' || status === 'replied'

  async function copyText() {
    try {
      await navigator.clipboard.writeText(p.text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      // буфер закрыт политикой браузера — текст всё равно на экране
    }
  }

  /**
   * YouTube поднимает нужный комментарий наверх списка, но страницу к
   * комментариям не прокручивает — и заставить его нельзя. Поэтому забираем
   * текст в буфер заранее: на YouTube останется Ctrl+F и вставить.
   */
  async function openComment() {
    await copyText()
    setOpened(true)
    setTimeout(() => setOpened(false), 9000)
  }

  return (
    <article
      className={`enter relative overflow-hidden border border-rule bg-surface pl-6 transition-opacity
        before:absolute before:top-0 before:bottom-0 before:left-0 before:w-px before:content-['']
        ${HEAT_EDGE[p.heat]} ${dimmed ? 'opacity-45' : ''}`}
    >
      <div className="p-6 pl-0">
        <header className="mb-5 flex flex-wrap items-baseline gap-x-4 gap-y-2">
          <span className={`label ${HEAT_TEXT[p.heat]}`}>{HEAT_LABEL[p.heat]}</span>
          <span className="nums text-[13px] text-muted">{p.score} баллов</span>
          <span className="nums ml-auto text-[13px] text-muted">{ago(p.publishedAt)}</span>
        </header>

        <blockquote className="font-display text-[1.45rem] leading-[1.45] font-light text-ink">
          {p.text}
        </blockquote>

        {!isRussian(p.text) && (
          <div className="mt-4 border-t border-rule pt-4">
            {translation ? (
              <p className="text-[0.95rem] leading-relaxed text-ink2">{translation}</p>
            ) : translating ? (
              <p className="label text-muted">Перевожу…</p>
            ) : (
              <p className="label text-muted">Перевод недоступен</p>
            )}
          </div>
        )}

        {p.signals.length > 0 && (
          <ul className="mt-5 flex flex-wrap gap-2">
            {p.signals.map((s) => (
              <li
                key={s}
                className="border border-rule px-2.5 py-1 text-[12px] text-ink2"
              >
                {s}
              </li>
            ))}
          </ul>
        )}

        <div className="nums mt-5 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[13px] text-muted">
          <span className="text-goldink">{p.author}</span>
          <span className="opacity-40">/</span>
          <span>{p.publishedAt.slice(0, 10)}</span>
          {p.likes > 0 && (
            <>
              <span className="opacity-40">/</span>
              <span>{p.likes} ♥</span>
            </>
          )}
          {p.replies > 0 && (
            <>
              <span className="opacity-40">/</span>
              <span>{p.replies} отв.</span>
            </>
          )}
        </div>

        <p className="mt-1 text-[13px] text-muted">
          Под роликом «{p.videoTitle}» — {p.channelTitle}
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          <a
            href={p.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={openComment}
            className="border border-gold px-5 py-2 text-[14px] font-medium text-goldink transition-colors hover:bg-gold hover:text-ground"
          >
            Открыть комментарий
          </a>
          <button
            type="button"
            onClick={copyText}
            title="Вставь текст в поиск по странице YouTube (Ctrl+F)"
            className="label border border-rule px-3 py-2 text-muted transition-colors hover:border-gold hover:text-goldink"
          >
            {copied ? 'Скопировано' : 'Копировать'}
          </button>

          <div className="ml-auto flex flex-wrap gap-2">
            {STATUSES.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => onStatus(status === s.id ? 'new' : s.id)}
                aria-pressed={status === s.id}
                className={`label border px-3 py-2 transition-colors ${
                  status === s.id
                    ? 'border-gold bg-goldsoft text-goldink'
                    : 'border-rule text-muted hover:border-gold hover:text-goldink'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {opened && (
          <p className="mt-4 border-l border-gold bg-goldsoft px-4 py-3 text-[13px] text-goldink">
            Текст скопирован. На YouTube прокрути вниз к комментариям — этот будет
            первым. Не нашёлся: Ctrl+F, Ctrl+V, Enter.
          </p>
        )}
      </div>
    </article>
  )
}
