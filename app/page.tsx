'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ProspectCard } from '@/components/ProspectCard'
import {
  armSound,
  askNotificationPermission,
  flashTitle,
  playChime,
  showNotification,
} from '@/lib/notify'
import { useStatuses, type Status } from '@/lib/status'
import { useTranslations } from '@/lib/translations'
import { DEFAULT_CONFIG, type Heat, type ScanResult } from '@/lib/types'

const CACHE = 'rossa-radar:lastScan:v1'
const CONFIG = 'rossa-radar:config:v2'
const KNOWN = 'rossa-radar:known:v1'

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
  { id: 'all', label: 'Все подряд' },
]

export default function Page() {
  const [result, setResult] = useState<ScanResult | null>(null)
  const [scannedAt, setScannedAt] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [settingsLoaded, setSettingsLoaded] = useState(false)
  const [saved, setSaved] = useState(false)
  const [heat, setHeat] = useState<HeatFilter>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('open')
  const [light, setLight] = useState<boolean | null>(null)
  const [watching, setWatching] = useState(false)
  const [everyMin, setEveryMin] = useState(15)
  const [nextAt, setNextAt] = useState<number | null>(null)
  const [freshCount, setFreshCount] = useState(0)

  /** Кого уже показывали — чтобы пикать только на новых. */
  const known = useRef<Set<string>>(new Set())
  const scanRef = useRef<() => Promise<void>>(async () => {})

  const [queries, setQueries] = useState(DEFAULT_CONFIG.queries.join('\n'))
  const [channels, setChannels] = useState(DEFAULT_CONFIG.channels.join('\n'))
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

  useEffect(() => {
    try {
      const raw = localStorage.getItem(CACHE)
      if (raw) {
        const prev = JSON.parse(raw) as { at: string; result: ScanResult }
        setResult(prev.result)
        setScannedAt(prev.at)
      }
      const seen = localStorage.getItem(KNOWN)
      if (seen) known.current = new Set(JSON.parse(seen) as string[])
      const cfg = localStorage.getItem(CONFIG)
      if (cfg) {
        const c = JSON.parse(cfg) as {
          queries: string
          channels?: string
          days: number
          perQuery: number
          minScore: number
        }
        setQueries(c.queries)
        setChannels(c.channels ?? '')
        setDays(c.days)
        setPerQuery(c.perQuery)
        setMinScore(c.minScore)
      }
    } catch {
      // хранилище повреждено или закрыто — начинаем с чистого, но не падаем
    }
    // Только теперь можно включать автосохранение: иначе первый же проход
    // затёр бы сохранённые настройки значениями по умолчанию.
    setSettingsLoaded(true)
  }, [])

  useEffect(() => {
    if (light === null) return
    document.documentElement.setAttribute('data-theme', light ? 'light' : 'dark')
  }, [light])

  useEffect(() => {
    if (result?.prospects.length) void translate(result.prospects)
  }, [result, translate])

  // Настройки сохраняются сами: отдельной кнопки нет, и её отсутствие не должно
  // стоить владельцу списка каналов, набитого вручную.
  useEffect(() => {
    if (!settingsLoaded) return
    const t = window.setTimeout(() => {
      try {
        localStorage.setItem(
          CONFIG,
          JSON.stringify({ queries, channels, days, perQuery, minScore }),
        )
        setSaved(true)
        window.setTimeout(() => setSaved(false), 1600)
      } catch {
        // хранилище заблокировано — настройки проживут до перезагрузки
      }
    }, 600)
    return () => window.clearTimeout(t)
  }, [settingsLoaded, queries, channels, days, perQuery, minScore])

  const runScan = useCallback(async () => {
    setRunning(true)
    setError(null)
    const list = queries.split('\n').map((q) => q.trim()).filter(Boolean)
    const channelList = channels.split('\n').map((c) => c.trim()).filter(Boolean)
    try {
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queries: list, channels: channelList, days, perQuery, minScore }),
      })
      const data = (await res.json()) as ScanResult & { error?: string }
      if (!res.ok || data.error) throw new Error(data.error ?? `Ошибка ${res.status}`)

      const at = new Date().toISOString()
      setResult(data)
      setScannedAt(at)

      // Первый в жизни скан не пикает: иначе на пустой памяти зазвонит на всех.
      const first = known.current.size === 0
      const appeared = data.prospects.filter((p) => !known.current.has(p.id))
      data.prospects.forEach((p) => known.current.add(p.id))

      if (!first && appeared.length > 0) {
        setFreshCount(appeared.length)
        playChime()
        const best = appeared[0]
        showNotification(
          `Радар: ${appeared.length} ${appeared.length === 1 ? 'новый' : 'новых'}`,
          `${best.author}: ${best.text.slice(0, 120)}`,
        )
        if (document.hidden) flashTitle(`● ${appeared.length} новых — Радар`)
      }

      try {
        localStorage.setItem(KNOWN, JSON.stringify([...known.current].slice(-3000)))
        localStorage.setItem(CACHE, JSON.stringify({ at, result: data }))
      } catch {
        // переполнено или закрыто — результаты живут до перезагрузки
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setRunning(false)
    }
  }, [queries, channels, days, perQuery, minScore])

  scanRef.current = runScan

  useEffect(() => {
    if (!watching) {
      setNextAt(null)
      return
    }
    const ms = Math.max(2, everyMin) * 60_000
    setNextAt(Date.now() + ms)
    const timer = window.setInterval(() => {
      setNextAt(Date.now() + ms)
      void scanRef.current()
    }, ms)
    return () => window.clearInterval(timer)
  }, [watching, everyMin])

  const toggleWatch = useCallback(async () => {
    if (watching) {
      setWatching(false)
      return
    }
    // Клик — то самое действие пользователя, без которого браузер не даёт звук.
    armSound()
    await askNotificationPermission()
    setWatching(true)
    void runScan()
  }, [watching, runScan])

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
    const q = queries.split('\n').filter((s) => s.trim()).length
    const c = channels.split('\n').filter((s) => s.trim()).length
    // Поисковый запрос стоит 100 единиц, канал — 2 (поиск канала + список видео).
    return q * 100 + c * 2 + (q + c) * perQuery
  }, [queries, channels, perQuery])

  const perDay = Math.floor((1440 / Math.max(2, everyMin)) * cost)

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-12 px-5 py-10 sm:px-10 sm:py-16">
      <header className="flex flex-col gap-7">
        <div className="flex items-start justify-between gap-6">
          <div className="flex flex-col gap-3">
            <span className="label text-golddim">The Rossa Group</span>
            <h1 className="font-display text-6xl leading-[0.95] font-light tracking-tight sm:text-7xl">
              Радар
            </h1>
          </div>
          <button
            type="button"
            onClick={() =>
              setLight((v) => !(v ?? !matchMedia('(prefers-color-scheme: dark)').matches))
            }
            className="label border border-rule px-3 py-2 text-muted transition-colors hover:border-gold hover:text-goldink"
          >
            Тема
          </button>
        </div>

        <p className="max-w-[58ch] text-[1.05rem] leading-relaxed text-ink2">
          Читает свежие комментарии под роликами про переезд и жизнь в Бразилии и
          показывает тех, кто собирается переехать или купить жильё. Контактов YouTube
          не отдаёт — отвечать можно только публично, под тем же роликом.
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={runScan}
            disabled={running}
            className="flex items-center gap-3 bg-gold px-7 py-3 text-[15px] font-semibold text-ground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {running && (
              <span
                aria-hidden
                className="sweep inline-block h-3.5 w-3.5 rounded-full border-2 border-current border-t-transparent"
              />
            )}
            {running ? 'Сканирую' : 'Запустить скан'}
          </button>

          <button
            type="button"
            onClick={toggleWatch}
            aria-pressed={watching}
            className={`flex items-center gap-2.5 border px-5 py-3 text-[15px] transition-colors ${
              watching
                ? 'border-gold bg-goldsoft text-goldink'
                : 'border-rule text-ink2 hover:border-gold hover:text-goldink'
            }`}
          >
            <span
              aria-hidden
              className={`inline-block h-1.5 w-1.5 rounded-full ${
                watching ? 'animate-pulse bg-gold' : 'bg-muted'
              }`}
            />
            {watching ? 'Слежу' : 'Следить и пикать'}
          </button>

          <button
            type="button"
            onClick={() => setShowSettings((s) => !s)}
            className="border border-rule px-5 py-3 text-[15px] text-ink2 transition-colors hover:border-gold hover:text-goldink"
          >
            Настройки
          </button>

          <span className="nums text-[13px] text-muted">~{cost} квоты за скан</span>
        </div>

        {watching && (
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3 border border-rule bg-surface px-5 py-4">
            <span className="label text-muted">Каждые</span>
            <input
              type="number"
              min={2}
              max={720}
              value={everyMin}
              onChange={(e) => setEveryMin(Number(e.target.value))}
              aria-label="Интервал проверки в минутах"
              className="nums w-20 border border-rule bg-sunken px-3 py-1.5 text-[15px]"
            />
            <span className="label text-muted">мин</span>
            <span className="nums text-[13px] text-muted">
              ≈{perDay.toLocaleString('ru-RU')} квоты в сутки
              {perDay > 10000 && <span className="text-alert"> — не влезет</span>}
            </span>
            {nextAt && (
              <span className="nums text-[13px] text-muted">
                следующая в {new Date(nextAt).toLocaleTimeString('ru-RU')}
              </span>
            )}
            <button
              type="button"
              onClick={() => {
                armSound()
                setTimeout(playChime, 60)
              }}
              className="label ml-auto border border-rule px-3 py-2 text-muted transition-colors hover:border-gold hover:text-goldink"
            >
              Проверить звук
            </button>
          </div>
        )}

        {freshCount > 0 && (
          <p className="enter border-l border-gold bg-goldsoft px-5 py-3 text-[15px] text-goldink">
            Новых с прошлой проверки: <strong>{freshCount}</strong>
          </p>
        )}
      </header>

      {showSettings && (
        <section className="flex flex-col gap-7 border border-rule bg-surface p-6 sm:p-8">
          <p className="label text-muted">
            {saved ? <span className="text-goldink">Сохранено</span> : 'Сохраняется само'}
          </p>

          <Area
            id="channels"
            title="Каналы под наблюдением"
            hint="По одной ссылке в строке. Годится и просто @handle. Канал стоит 2 единицы квоты против 100 за поисковый запрос — список можно держать длинным."
            value={channels}
            onChange={setChannels}
            rows={10}
            placeholder="https://www.youtube.com/@handle"
          />

          <Area
            id="queries"
            title="Поисковые запросы"
            hint="Нужны, только чтобы находить новые каналы и ролики вне списка. Каждый стоит 100 единиц — для ежедневной работы держи поле пустым."
            value={queries}
            onChange={setQueries}
            rows={4}
            placeholder="retire in Brazil"
          />

          <div className="grid gap-6 sm:grid-cols-3">
            <Field id="days" label="Глубина, дней" hint="Комментарии старше отбрасываются" value={days} min={1} max={365} onChange={setDays} />
            <Field id="perQuery" label="Роликов на источник" hint="С каждого канала и запроса" value={perQuery} min={1} max={50} onChange={setPerQuery} />
            <Field id="minScore" label="Порог баллов" hint="Горячий от 60, тёплый от 38" value={minScore} min={0} max={100} onChange={setMinScore} />
          </div>
        </section>
      )}

      {error && (
        <p className="border-l border-alert bg-alertsoft px-5 py-4 text-[15px] text-alert">
          {error}
        </p>
      )}

      {translateError && (
        <p className="border border-rule bg-surface px-5 py-4 text-[14px] text-muted">
          Перевод не работает: {translateError}
        </p>
      )}

      {result && (
        <>
          <section className="grid grid-cols-2 gap-px border border-rule bg-rule sm:grid-cols-4">
            <Stat label="Найдено людей" value={result.prospects.length} accent />
            <Stat label="Не обработано" value={counts.open} />
            <Stat label="Свежих реплик" value={result.stats.freshComments} />
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

          <div className="flex flex-col gap-5">
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
              <p className="border border-dashed border-rule px-6 py-16 text-center text-[15px] text-muted">
                В этом срезе пусто. Смени фильтр или запусти скан заново.
              </p>
            )}
          </div>

          <footer className="nums flex flex-col gap-2 border-t border-rule pt-6 text-[13px] text-muted">
            <p>
              Скан {scannedAt ? new Date(scannedAt).toLocaleString('ru-RU') : '—'} · каналов{' '}
              {result.stats.channelsRead.length} · роликов найдено {result.stats.videosFound} ·
              комментариев просмотрено {result.stats.commentsScanned} · квота{' '}
              {result.stats.quotaUsed} · {(result.stats.tookMs / 1000).toFixed(1)} с
            </p>
            {result.errors.length > 0 && (
              <p className="text-alert">Сбои: {result.errors.join(' · ')}</p>
            )}
          </footer>
        </>
      )}

      {!result && !running && (
        <p className="border border-dashed border-rule px-6 py-20 text-center text-[15px] text-muted">
          Сканов ещё не было. Нажми «Запустить скан» — займёт секунд двадцать.
        </p>
      )}
    </div>
  )
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="flex flex-col gap-2 bg-surface px-5 py-5">
      <span className="label text-muted">{label}</span>
      <span
        className={`nums font-display text-4xl leading-none font-light ${
          accent ? 'text-goldink' : 'text-ink'
        }`}
      >
        {value}
      </span>
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
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          aria-pressed={value === o.id}
          className={`label border px-3.5 py-2 transition-colors ${
            value === o.id
              ? 'border-gold bg-goldsoft text-goldink'
              : 'border-rule text-muted hover:border-gold hover:text-goldink'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function Area({
  id,
  title,
  hint,
  value,
  onChange,
  rows,
  placeholder,
}: {
  id: string
  title: string
  hint: string
  value: string
  onChange: (v: string) => void
  rows: number
  placeholder: string
}) {
  return (
    <div className="flex flex-col gap-2.5">
      <label htmlFor={id} className="font-display text-2xl font-normal">
        {title}
      </label>
      <p className="max-w-[62ch] text-[14px] leading-relaxed text-muted">{hint}</p>
      <textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        spellCheck={false}
        placeholder={placeholder}
        className="border border-rule bg-sunken p-4 text-[13px] leading-relaxed text-ink2"
      />
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
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="label text-ink2">
        {label}
      </label>
      <input
        id={id}
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="nums border border-rule bg-sunken px-3 py-2.5 text-[15px]"
      />
      <span className="text-[13px] text-muted">{hint}</span>
    </div>
  )
}
