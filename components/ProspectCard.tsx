'use client'

import type { Prospect } from '@/lib/types'
import type { Status } from '@/lib/status'
import { STATUSES } from '@/lib/status'

const HEAT_LABEL = { hot: 'Горячий', warm: 'Тёплый', cold: 'Холодный' } as const

const HEAT_CLASS = {
  hot: 'bg-hotsoft text-hot',
  warm: 'bg-warmsoft text-warm',
  cold: 'bg-coldsoft text-cold',
} as const

const BORDER_CLASS = {
  hot: 'border-l-hot',
  warm: 'border-l-warm',
  cold: 'border-l-cold',
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
  onStatus,
}: {
  p: Prospect
  status: Status
  onStatus: (s: Status) => void
}) {
  const dimmed = status === 'rejected' || status === 'replied'

  return (
    <article
      className={`rounded-sm border border-rule border-l-[3px] bg-surface p-5 ${
        BORDER_CLASS[p.heat]
      } ${dimmed ? 'opacity-55' : ''}`}
    >
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <span
          className={`rounded-xs px-2 py-[3px] font-mono text-[11px] font-medium tracking-[0.11em] uppercase ${
            HEAT_CLASS[p.heat]
          }`}
        >
          {HEAT_LABEL[p.heat]}
        </span>
        <span className="font-mono text-[12px] tabular-nums text-muted">{p.score} баллов</span>
        <span className="ml-auto font-mono text-[12px] text-muted">{ago(p.publishedAt)}</span>
      </div>

      <blockquote className="border-l-2 border-rule py-1 pl-4 font-display text-[15px] leading-relaxed">
        {p.text}
      </blockquote>

      {p.signals.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {p.signals.map((s) => (
            <li
              key={s}
              className="rounded-xs bg-raised px-2 py-[2px] font-mono text-[11px] text-ink2"
            >
              {s}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1 font-mono text-[12px] text-muted tabular-nums">
        <span className="text-accentink">{p.author}</span>
        <span className="opacity-50">·</span>
        <span>{p.publishedAt.slice(0, 10)}</span>
        {p.likes > 0 && (
          <>
            <span className="opacity-50">·</span>
            <span>{p.likes} ♥</span>
          </>
        )}
        {p.replies > 0 && (
          <>
            <span className="opacity-50">·</span>
            <span>{p.replies} отв.</span>
          </>
        )}
      </div>

      <p className="mt-1.5 text-[13px] text-muted">
        Под роликом «{p.videoTitle}» — {p.channelTitle}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <a
          href={p.url}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-xs border border-accent px-3.5 py-1.5 text-sm font-semibold text-accentink transition-colors hover:bg-accentsoft"
        >
          Открыть комментарий →
        </a>
        <div className="flex flex-wrap gap-1.5">
          {STATUSES.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => onStatus(status === s.id ? 'new' : s.id)}
              aria-pressed={status === s.id}
              className={`rounded-xs border px-2.5 py-1.5 font-mono text-[11px] tracking-wide uppercase transition-colors ${
                status === s.id
                  ? 'border-accent bg-accentsoft text-accentink'
                  : 'border-rule text-muted hover:border-accent hover:text-accentink'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
    </article>
  )
}
