'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ProspectCard } from '@/components/ProspectCard'
import { useStatuses, type Status } from '@/lib/status'
import { useTranslations } from '@/lib/translations'
import { DEFAULT_CONFIG, type Heat, type ScanResult } from '@/lib/types'

const CACHE = 'rossa-radar:lastScan:v1'
const CONFIG = 'rossa-radar:config:v1'

type HeatFilter = Heat | 'all'
type StatusFilter = 'all' | 'open' | Status

const HEAT_TABS: { id: HeatFilter; label: string }[] = [
  { id: 'all', label: 'Все' },
  { id: 'hot', label: 'Горячие' },
  { id: 'warm', label: 'Тёплые' },
  { id: 'cold', label: 'Холодные' },
]

const STATUS_TABS: { id: StatusFilter; label: string }[] = [
  { id: 'open', label: 'Необработанные' },
  { id: 'working', label: 'В работе' },
  { id: 'replied', label: 'Ответили' },
  { id: 'rejected', label: 'Не наши' },
  { id: 'all', label: 'Показать все' },
]

export default function Page() {
  const [result, setResult] = useState<ScanResult | null>(null)
  const [scannedAt, setScannedAt] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [heat, setHeat] = useState<HeatFilter>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('open')
  const [dark, setDark] = useState<boolean | null>(null)

  const [queries, setQueries] = useState(DEFAULT_CONFIG.queries.join('\n'))
  const [days, setDays] = useState(DEFAULT_CONFIG.days)
  const [perQuery, setPerQuery] = useState(DEFAULT_CONFIG.perQuery)
  const [minScore, setMinScore] = useState(DEFAULT_CONFIG.minScore)

  const { map: statuses, set: setStatus } = useStatuses()
  const {
    map: translations,
    translate,
    pending: translating,
    error: translateError,
  } = useTranslations()

  // restore the previous scan and settings — a scan costs quota, don't lose it
  useEffect(() => {
    try {
      const raw = localStorage.getItem(CACHE)
      if (raw) {
        const saved = JSON.parse(raw) as { at: string; result: ScanResult }
        setResult(saved.result)
        setScannedAt(saved.at)
      }
      const cfg = localStorage.getItem(CONFIG)
      if (cfg) {
        const c = JSON.parse(cfg) as {
          queries: string
          days: number
          perQuery: number
          minScore: number
        }
        setQueries(c.queries)
        setDays(c.days)
        setPerQuery(c.perQuery)
        setMinScore(c.minScore)
      }
    } catch {
      // corrupt or blocked storage — start clean rather than crash
    }
  }, [])

  useEffect(() => {
    if (dark === null) return
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
  }, [dark])

  // Translate whatever the last scan turned up — cached, so this is a no-op
  // for comments already seen.
  useEffect(() => {
    if (result?.prospects.length) void translate(result.prospects)
  }, [result, translate])

  const runScan = useCallback(async () => {
    setRunning(true)
    setError(null)
    const list = queries
      .split('\n')
      .map((q) => q.trim())
      .filter(Boolean)
    try {
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queries: list, days, perQuery, minScore }),
      })
      const data = (await res.json()) as ScanResult & { error?: string }
      if (!res.ok || data.error) throw new Error(data.error ?? `Ошибка ${res.status}`)
      const at = new Date().toISOString()
      setResult(data)
      setScannedAt(at)
      try {
        localStorage.setItem(CACHE, JSON.stringify({ at, result: data }))
        localStorage.setItem(CONFIG, JSON.stringify({ queries, days, perQuery, minScore }))
      } catch {
        // over quota or blocked — results stay in memory for this session
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setRunning(false)
    }
  }, [queries, days, perQuery, minScore])

  const counts = useMemo(() => {
    const p = result?.prospects ?? []
    return {
      hot: p.filter((x) => x.heat === 'hot').length,
      warm: p.filter((x) => x.heat === 'warm').length,
      cold: p.filter((x) => x.heat === 'cold').length,
      open: p.filter((x) => !statuses[x.id]).length,
    }
  }, [result, statuses])

  const visible = useMemo(() => {
    let p = result?.prospects ?? []
    if (heat !== 'all') p = p.filter((x) => x.heat === heat)
    if (statusFilter === 'open') p = p.filter((x) => !statuses[x.id])
    else if (statusFilter !== 'all') p = p.filter((x) => statuses[x.id] === statusFilter)
    return p
  }, [result, heat, statusFilter, statuses])

  const cost = useMemo(() => {
    const n = queries.split('\n').filter((q) => q.trim()).length
    return n * 100 + n * perQuery
  }, [queries, perQuery])

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8 px-4 py-8 sm:px-8 sm:py-12">
      <header className="flex flex-col gap-4 border-b border-rule pb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-1.5">
            <span className="font-mono text-[11px] tracking-[0.16em] text-muted uppercase">
              The Rossa Group · поиск покупателей
            </span>
            <h1 className="font-display text-4xl leading-tight font-bold tracking-tight text-balance">
              Радар
            </h1>
          </div>
          <button
            type="button"
            onClick={() => setDark((d) => !(d ?? matchMedia('(prefers-color-scheme: dark)').matches))}
            className="rounded-xs border border-rule px-3 py-1.5 font-mono text-[11px] tracking-wide text-muted uppercase transition-colors hover:border-accent hover:text-accentink"
          >
            Тема
          </button>
        </div>

        <p className="max-w-[62ch] text-[15px] text-ink2">
          Читает свежие комментарии под англоязычными роликами про переезд и жизнь в Бразилии
          и показывает тех, кто собирается переехать или купить жильё. Контактов YouTube не
          отдаёт — отвечать можно только публично, под тем же роликом.
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={runScan}
            disabled={running}
            className="flex items-center gap-2.5 rounded-xs bg-accent px-5 py-2.5 text-sm font-semibold text-ground transition-opacity disabled:opacity-60"
          >
            {running && (
              <span
                aria-hidden
                className="sweep inline-block h-3.5 w-3.5 rounded-full border-2 border-current border-t-transparent"
              />
            )}
            {running ? 'Сканирую…' : 'Запустить скан'}
          </button>
          <button
            type="button"
            onClick={() => setShowSettings((s) => !s)}
            className="rounded-xs border border-rule px-4 py-2.5 text-sm font-medium text-ink2 transition-colors hover:border-accent hover:text-accentink"
          >
            {showSettings ? 'Свернуть настройки' : 'Настройки поиска'}
          </button>
          <span className="font-mono text-[12px] text-muted tabular-nums">
            ~{cost} из 10 000 квоты за скан
          </span>
        </div>
      </header>

      {showSettings && (
        <section className="flex flex-col gap-5 rounded-sm border border-rule bg-surface p-5">
          <div className="flex flex-col gap-2">
            <label htmlFor="queries" className="font-display text-base font-semibold">
              Поисковые запросы
            </label>
            <p className="text-[13px] text-muted">
              По одному в строке. Каждый запрос стоит 100 единиц квоты — это самая дорогая
              часть скана. Пиши по-английски: ищем американскую аудиторию.
            </p>
            <textarea
              id="queries"
              value={queries}
              onChange={(e) => setQueries(e.target.value)}
              rows={8}
              spellCheck={false}
              className="rounded-xs border border-rule bg-ground p-3 font-mono text-[13px] leading-relaxed"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field
              id="days"
              label="Глубина, дней"
              hint="Комментарии старше этого срока отбрасываются"
              value={days}
              min={1}
              max={365}
              onChange={setDays}
            />
            <Field
              id="perQuery"
              label="Роликов на запрос"
              hint="Больше роликов — шире охват, дороже скан"
              value={perQuery}
              min={1}
              max={25}
              onChange={setPerQuery}
            />
            <Field
              id="minScore"
              label="Порог баллов"
              hint="Ниже порога комментарий не показывается"
              value={minScore}
              min={0}
              max={100}
              onChange={setMinScore}
            />
          </div>
        </section>
      )}

      {error && (
        <p className="rounded-sm border border-hot bg-hotsoft px-4 py-3 text-sm text-hot">
          {error}
        </p>
      )}

      {translateError && (
        <p className="rounded-sm border border-rule bg-surface px-4 py-3 text-sm text-muted">
          Перевод не работает: {translateError}
        </p>
      )}

      {result && (
        <>
          <section className="grid grid-cols-2 gap-px overflow-hidden rounded-sm border border-rule bg-rulesoft sm:grid-cols-4">
            <Stat label="Найдено людей" value={result.prospects.length} />
            <Stat label="Не обработано" value={counts.open} />
            <Stat label="Свежих комментариев" value={result.stats.freshComments} />
            <Stat label="Роликов прочитано" value={result.stats.videosRead} />
          </section>

          <div className="flex flex-col gap-3">
            <Tabs
              options={HEAT_TABS.map((t) => ({
                ...t,
                label:
                  t.id === 'all'
                    ? t.label
                    : `${t.label} ${counts[t.id as Exclude<HeatFilter, 'all'>]}`,
              }))}
              value={heat}
              onChange={setHeat}
            />
            <Tabs options={STATUS_TABS} value={statusFilter} onChange={setStatusFilter} />
          </div>

          <div className="flex flex-col gap-4">
            {visible.map((p) => (
              <ProspectCard
                key={p.id}
                p={p}
                status={statuses[p.id] ?? 'new'}
                translation={translations[p.id]}
                translating={translating}
                onStatus={(s) => setStatus(p.id, s)}
              />
            ))}
            {visible.length === 0 && (
              <p className="rounded-sm border border-dashed border-rule px-5 py-10 text-center text-sm text-muted">
                В этом срезе пусто. Смени фильтр или запусти скан заново.
              </p>
            )}
          </div>

          <footer className="flex flex-col gap-1.5 border-t border-rule pt-5 font-mono text-[12px] text-muted tabular-nums">
            <p>
              Скан {scannedAt ? new Date(scannedAt).toLocaleString('ru-RU') : '—'} · роликов
              найдено {result.stats.videosFound} · комментариев просмотрено{' '}
              {result.stats.commentsScanned} · квота {result.stats.quotaUsed} ·{' '}
              {(result.stats.tookMs / 1000).toFixed(1)} с
            </p>
            {result.errors.length > 0 && (
              <p className="text-hot">Сбои: {result.errors.join(' · ')}</p>
            )}
          </footer>
        </>
      )}

      {!result && !running && (
        <p className="rounded-sm border border-dashed border-rule px-5 py-12 text-center text-sm text-muted">
          Сканов ещё не было. Нажми «Запустить скан» — займёт секунд двадцать.
        </p>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col gap-1 bg-surface px-4 py-3.5">
      <span className="font-mono text-[11px] tracking-[0.12em] text-muted uppercase">
        {label}
      </span>
      <span className="font-display text-2xl font-bold tabular-nums">{value}</span>
    </div>
  )
}

function Tabs<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { id: T; label: string }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          aria-pressed={value === o.id}
          className={`rounded-xs border px-3 py-1.5 font-mono text-[11px] tracking-wide uppercase transition-colors ${
            value === o.id
              ? 'border-accent bg-accentsoft text-accentink'
              : 'border-rule text-muted hover:border-accent hover:text-accentink'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function Field({
  id,
  label,
  hint,
  value,
  min,
  max,
  onChange,
}: {
  id: string
  label: string
  hint: string
  value: number
  min: number
  max: number
  onChange: (n: number) => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="font-display text-sm font-semibold">
        {label}
      </label>
      <input
        id={id}
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="rounded-xs border border-rule bg-ground px-3 py-2 font-mono text-sm tabular-nums"
      />
      <span className="text-[12px] text-muted">{hint}</span>
    </div>
  )
}
