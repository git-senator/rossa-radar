/**
 * Разведка каналов: ищет ролики по теме, собирает каналы и ранжирует их
 * по тому, сколько под ними реально пишут — а не по числу подписчиков.
 * Разовый инструмент, запускается руками: node scripts/find-channels.mjs
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
  const qs = new URLSearchParams({ ...params, key: KEY })
  const res = await fetch(`${API}${endpoint}?${qs}`)
  quota += cost
  if (!res.ok) throw new Error(`${endpoint} ${res.status}: ${(await res.text()).slice(0, 160)}`)
  return res.json()
}

const REGIONS = {
  США: {
    lang: 'en',
    queries: [
      'moving to Brazil from USA',
      'retire in Brazil American expat',
      'living in Brazil as an American',
      'cost of living in Brazil 2026',
      'buying property in Brazil foreigner',
      'Americans moving abroad Latin America',
    ],
  },
  Канада: {
    lang: 'en',
    queries: [
      'moving to Brazil from Canada',
      'Canadian expat Brazil',
      'Canadians retiring abroad cheaper',
      'leaving Canada moving abroad 2026',
    ],
  },
  Россия: {
    lang: 'ru',
    queries: [
      'переезд в Бразилию',
      'жизнь в Бразилии русские',
      'недвижимость в Бразилии',
      'ВНЖ Бразилия',
      'переезд в Латинскую Америку',
      'эмиграция в Южную Америку',
    ],
  },
}

const channels = new Map() // channelId -> { region, videos:Set }
const videoIds = new Set()
const videoOwner = new Map()

for (const [region, cfg] of Object.entries(REGIONS)) {
  for (const q of cfg.queries) {
    try {
      const d = await call(
        'search',
        {
          part: 'snippet',
          q,
          type: 'video',
          maxResults: 25,
          relevanceLanguage: cfg.lang,
          order: 'relevance',
        },
        100,
      )
      for (const it of d.items ?? []) {
        const cid = it.snippet.channelId
        const vid = it.id.videoId
        videoIds.add(vid)
        videoOwner.set(vid, cid)
        if (!channels.has(cid)) {
          channels.set(cid, {
            id: cid,
            title: it.snippet.channelTitle,
            regions: new Set(),
            videos: new Set(),
          })
        }
        channels.get(cid).regions.add(region)
        channels.get(cid).videos.add(vid)
      }
    } catch (e) {
      console.error('поиск не удался:', q, e.message)
    }
  }
}

console.error(`каналов ${channels.size}, роликов ${videoIds.size}, квота ${quota}`)

// ---- активность: сколько комментариев и просмотров у найденных роликов ----
const vids = [...videoIds]
for (let i = 0; i < vids.length; i += 50) {
  const d = await call('videos', { part: 'statistics', id: vids.slice(i, i + 50).join(',') }, 1)
  for (const v of d.items ?? []) {
    const c = channels.get(videoOwner.get(v.id))
    if (!c) continue
    c.comments = (c.comments ?? 0) + Number(v.statistics.commentCount ?? 0)
    c.views = (c.views ?? 0) + Number(v.statistics.viewCount ?? 0)
  }
}

// ---- размер канала и его хэндл ----
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
  }
}

const rows = [...channels.values()]
  .filter((c) => (c.comments ?? 0) > 0)
  .map((c) => ({
    ...c,
    regions: [...c.regions],
    hits: c.videos.size,
    // Разговорчивость: сколько комментариев приходится на просмотр.
    talk: c.views ? (c.comments / c.views) * 1000 : 0,
  }))

writeFileSync(
  'channels-report.json',
  JSON.stringify(
    { quota, rows: rows.sort((a, b) => b.comments - a.comments) },
    (k, v) => (v instanceof Set ? [...v] : v),
    1,
  ),
)

for (const region of Object.keys(REGIONS)) {
  console.log(`\n===== ${region} =====`)
  rows
    .filter((r) => r.regions.includes(region))
    .sort((a, b) => b.comments - a.comments)
    .slice(0, 14)
    .forEach((r, i) => {
      console.log(
        `${String(i + 1).padStart(2)}. ${r.title}  [${r.handle ?? '—'}]  ` +
          `коммент ${r.comments}  подписч ${r.subs}  роликов ${r.hits}  ` +
          `разговорчивость ${r.talk.toFixed(2)}  ${r.country ?? ''}`,
      )
    })
}
console.error(`\nитого квота ${quota}`)
