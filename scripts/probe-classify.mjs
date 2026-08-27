/** Прогоняет свежие комментарии каналов через классификатор и показывает,
 *  что он видит. node scripts/probe-classify.mjs  */
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
)
const KEY = env.YOUTUBE_API_KEY
const API = 'https://www.googleapis.com/youtube/v3/'

const HANDLES = [
  '@sizova_k', '@invest_in_brazil', '@svoibrazil', '@brazilpapa',
  '@balakina_brazil', '@kirill_brasil', '@bitvalatam', '@katia.brazil',
]

const TOPIC =
  /(бразил|brazil|brasil|флорианопол|внж|гражданств|переезд|переехать|недвижимост|квартир|жиль[ёе]|участок|дом)/i

const since = new Date(Date.now() - 60 * 86400000)
const found = []

for (const h of HANDLES) {
  const ch = await fetch(
    `${API}channels?part=contentDetails&forHandle=${encodeURIComponent(h)}&key=${KEY}`,
  ).then((r) => r.json())
  const up = ch.items?.[0]?.contentDetails?.relatedPlaylists?.uploads
  if (!up) continue
  const pl = await fetch(
    `${API}playlistItems?part=snippet&playlistId=${up}&maxResults=20&key=${KEY}`,
  ).then((r) => r.json())

  for (const it of pl.items ?? []) {
    const vid = it.snippet.resourceId.videoId
    const th = await fetch(
      `${API}commentThreads?part=snippet&videoId=${vid}&maxResults=100&order=time&textFormat=plainText&key=${KEY}`,
    ).then((r) => r.json())
    for (const t of th.items ?? []) {
      const c = t.snippet.topLevelComment.snippet
      if (new Date(c.publishedAt) < since) continue
      const text = c.textDisplay.replace(/\s+/g, ' ').trim()
      if (TOPIC.test(text) && text.length > 60) {
        found.push({ h, author: c.authorDisplayName, text })
      }
    }
  }
}

console.log(`Тематических комментариев: ${found.length}\n`)
for (const f of found.slice(0, 40)) {
  console.log(`[${f.h}] ${f.author}`)
  console.log(`  ${f.text.slice(0, 260)}\n`)
}
