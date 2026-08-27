/**
 * Русскоязычные блогеры, которые уже живут в Бразилии.
 * Разовый инструмент: node scripts/find-ru-brazil.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
)
const KEY = env.YOUTUBE_API_KEY
const API = 'https://www.googleapis.com/youtube/v3/'
let quota = 0

async function call(endpoint, params, cost) {
  const res = await fetch(`${API}${endpoint}?${new URLSearchParams({ ...params, key: KEY })}`)
  quota += cost
  if (!res.ok) throw new Error(`${endpoint} ${res.status}`)
  return res.json()
}

const QUERIES = [
  'русские в Бразилии',
  'жизнь в Бразилии влог на русском',
  'переехали в Бразилию из России',
  'Бразилия глазами русского',
  'Рио де Жанейро жизнь русских',
  'Флорианополис Бразилия русские',
  'Сан-Паулу жизнь русские',
  'Бразилия недвижимость на русском',
  'как я живу в Бразилии',
  'русская в Бразилии замуж',
]

const channels = new Map()
const videoOwner = new Map()
const videoIds = new Set()

for (const q of QUERIES) {
  try {
    const d = await call(
      'search',
      { part: 'snippet', q, type: 'video', maxResults: 25, relevanceLanguage: 'ru' },
      100,
    )
    for (const it of d.items ?? []) {
      const cid = it.snippet.channelId
      videoIds.add(it.id.videoId)
      videoOwner.set(it.id.videoId, cid)
      if (!channels.has(cid)) {
        channels.set(cid, { id: cid, title: it.snippet.channelTitle, hits: 0, comments: 0, views: 0 })
      }
      channels.get(cid).hits++
    }
  } catch (e) {
    console.error(q, e.message)
  }
}

const vids = [...videoIds]
for (let i = 0; i < vids.length; i += 50) {
  const d = await call('videos', { part: 'statistics', id: vids.slice(i, i + 50).join(',') }, 1)
  for (const v of d.items ?? []) {
    const c = channels.get(videoOwner.get(v.id))
    if (!c) continue
    c.comments += Number(v.statistics.commentCount ?? 0)
    c.views += Number(v.statistics.viewCount ?? 0)
  }
}

const ids = [...channels.keys()]
for (let i = 0; i < ids.length; i += 50) {
  const d = await call(
    'channels',
    { part: 'snippet,statistics', id: ids.slice(i, i + 50).join(',') },
    1,
  )
  for (const ch of d.items ?? []) {
    const c = channels.get(ch.id)
    if (!c) continue
    c.handle = ch.snippet.customUrl ?? null
    c.subs = Number(ch.statistics.subscriberCount ?? 0)
    c.country = ch.snippet.country ?? null
    c.desc = (ch.snippet.description ?? '').replace(/\s+/g, ' ').slice(0, 220)
    c.title = ch.snippet.title
  }
}

// Живёт в Бразилии: либо страна канала BR, либо Бразилия прямо в названии
// или описании — многие не заполняют страну вообще.
const BRAZIL = /бразил|brazil|brasil|рио|rio de|сан-?паулу|sao paulo|флорианопол|florianop|баия|bahia|ресифи|recife|форталеза|натал\b|куритиба|curitiba/i

const rows = [...channels.values()]
  .filter((c) => c.comments > 0)
  .filter((c) => c.country === 'BR' || BRAZIL.test(`${c.title} ${c.desc}`))
  .map((c) => ({ ...c, talk: c.views ? (c.comments / c.views) * 1000 : 0 }))
  .sort((a, b) => b.comments - a.comments)

writeFileSync('ru-brazil.json', JSON.stringify({ quota, rows }, null, 1))

rows.slice(0, 20).forEach((r, i) => {
  console.log(
    `${String(i + 1).padStart(2)}. ${r.title}\n    [${r.handle ?? '—'}] подписч ${r.subs} · ` +
      `коммент ${r.comments} · роликов ${r.hits} · разговорчивость ${r.talk.toFixed(1)} · ${r.country ?? '—'}\n` +
      `    ${r.desc}`,
  )
})
console.error(`\nвсего ${rows.length} каналов, квота ${quota}`)
