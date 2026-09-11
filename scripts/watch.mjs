/**
 * Круглосуточный обход: спрашивает радар, что нового, и шлёт в Telegram тех,
 * кого раньше не показывал.
 *
 * Запускается GitHub Actions по расписанию. Память о показанных живёт в
 * state/seen.json и коммитится обратно в репозиторий — отдельная база ради
 * списка идентификаторов была бы лишней сущностью.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname } from 'node:path'

const RADAR_URL = (process.env.RADAR_URL || 'https://rossa-radar.vercel.app').replace(/\/$/, '')
const TOKEN = process.env.TELEGRAM_BOT_TOKEN
const CHAT = process.env.TELEGRAM_CHAT_ID
const SEEN_PATH = 'state/seen.json'

/** Сколько идентификаторов помним. Дальше самые старые вытесняются. */
const SEEN_LIMIT = 5000

if (!TOKEN || !CHAT) {
  console.error('Нет TELEGRAM_BOT_TOKEN или TELEGRAM_CHAT_ID — оповещать некуда.')
  process.exit(1)
}

const cfg = JSON.parse(readFileSync('watchlist.json', 'utf8'))

/**
 * Частый обход берёт только каналы: поисковый запрос стоит 100 единиц квоты
 * против 2 за канал, а суточный потолок YouTube — 10 000 на всех, включая
 * ручные сканы с сайта. Полный обход с запросами workflow включает раз в сутки.
 */
const DEEP = /^(1|true|yes)$/i.test(process.env.WITH_QUERIES ?? '')
const perQuery = DEEP ? (cfg.perQuery ?? 15) : (cfg.watch?.perQuery ?? cfg.perQuery ?? 15)
console.log(DEEP ? 'Полный обход: каналы и поисковые запросы.' : 'Частый обход: только каналы.')

const seen = existsSync(SEEN_PATH)
  ? JSON.parse(readFileSync(SEEN_PATH, 'utf8'))
  : { ids: [] }
const seenSet = new Set(seen.ids)

// ---- 1. спросить радар ------------------------------------------------------
const res = await fetch(`${RADAR_URL}/api/scan`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    queries: DEEP ? (cfg.queries ?? []) : [],
    channels: cfg.channels ?? [],
    days: cfg.days ?? 3,
    perQuery,
    minScore: cfg.minScore ?? 25,
  }),
})

if (!res.ok) {
  console.error(`Радар ответил ${res.status}: ${(await res.text()).slice(0, 300)}`)
  process.exit(1)
}

const { prospects = [], stats = {}, errors = [] } = await res.json()
if (errors.length) console.warn('Сбои при обходе:', errors.join(' | '))
console.log(
  `Обход: роликов ${stats.videosRead}, свежих комментариев ${stats.freshComments}, ` +
    `найдено ${prospects.length}, квота ${stats.quotaUsed}`,
)

const notifyFrom = cfg.notifyFrom ?? 38
const fresh = prospects.filter((p) => p.score >= notifyFrom && !seenSet.has(p.id))

if (fresh.length === 0) {
  console.log('Новых достойных внимания нет.')
  save(prospects)
  process.exit(0)
}

// ---- 2. перевести, если переводчик доступен ---------------------------------
// Русские комментарии не переводим — они и так читаемы.
const needTranslation = fresh
  .filter((p) => !/[Ѐ-ӿ]/.test(p.text))
  .map((p) => ({ id: p.id, text: p.text }))

let translations = {}
if (needTranslation.length > 0) {
  try {
    const tr = await fetch(`${RADAR_URL}/api/translate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: needTranslation }),
    })
    if (tr.ok) translations = (await tr.json()).translations ?? {}
  } catch (e) {
    console.warn('Перевод недоступен:', e.message)
  }
}

// ---- 3. разослать -----------------------------------------------------------
const HEAT = { hot: '🔥 Горячий', warm: '🟡 Тёплый', cold: '⚪ Холодный' }

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function clip(s, n) {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s
}

/** Ссылку на канал автора YouTube отдаёт по http — лишний редирект на телефоне. */
function https(u) {
  return u.replace(/^http:\/\//, 'https://')
}

let sent = 0
for (const p of fresh) {
  const ru = translations[p.id]
  const lines = [
    `${HEAT[p.heat] ?? p.heat} · <b>${p.score}</b> баллов`,
    '',
    `<blockquote>${esc(clip(p.text, 600))}</blockquote>`,
  ]
  if (ru) lines.push('', `<i>${esc(clip(ru, 600))}</i>`)
  lines.push(
    '',
    `${esc(p.signals.join(' · '))}`,
    '',
    `${esc(p.author)} · ${p.publishedAt.slice(0, 10)}`,
    `Под роликом «${esc(clip(p.videoTitle, 90))}» — ${esc(p.channelTitle)}`,
  )

  const send = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: CHAT,
      text: lines.join('\n'),
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
      /**
       * Кнопками, а не ссылкой в конце текста: карточка длинная, последняя
       * строка в ней теряется, а по кнопке ещё и попадать пальцем легче.
       *
       * `p.url` уже содержит `lc` — YouTube по нему прокручивает к нужному
       * комментарию и подсвечивает его. Вторая кнопка ведёт на канал автора:
       * личных сообщений на YouTube нет, и канал — единственное, что о
       * человеке вообще можно узнать до публичного ответа.
       */
      reply_markup: {
        inline_keyboard: [
          [
            { text: '💬 Открыть комментарий', url: p.url },
            ...(p.authorChannel ? [{ text: '👤 Автор', url: https(p.authorChannel) }] : []),
          ],
        ],
      },
    }),
  })

  if (send.ok) {
    sent++
    seenSet.add(p.id)
  } else {
    // Не помечаем как показанное — попробуем в следующий обход.
    console.error(`Telegram отказал: ${(await send.text()).slice(0, 200)}`)
  }
  await new Promise((r) => setTimeout(r, 1200)) // бережём лимиты Telegram
}

console.log(`Отправлено ${sent} из ${fresh.length}.`)
save(prospects)

/** Помечает всё найденное как виденное, чтобы слабые не всплывали заново. */
function save(all) {
  for (const p of all) seenSet.add(p.id)
  const ids = [...seenSet].slice(-SEEN_LIMIT)
  mkdirSync(dirname(SEEN_PATH), { recursive: true })
  writeFileSync(SEEN_PATH, `${JSON.stringify({ ids }, null, 1)}\n`)
}
