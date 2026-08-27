/** Находит конкретный комментарий и печатает варианты ссылки на него. */
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
)
const KEY = env.YOUTUBE_API_KEY
const API = 'https://www.googleapis.com/youtube/v3/'
const AUTHOR = process.argv[2] ?? 'Taylor_847'

const ch = await fetch(`${API}channels?part=contentDetails&forHandle=@nordicinvestor&key=${KEY}`)
  .then((r) => r.json())
const up = ch.items[0].contentDetails.relatedPlaylists.uploads

const pl = await fetch(
  `${API}playlistItems?part=snippet&playlistId=${up}&maxResults=25&key=${KEY}`,
).then((r) => r.json())

for (const it of pl.items) {
  const vid = it.snippet.resourceId.videoId
  const th = await fetch(
    `${API}commentThreads?part=snippet&videoId=${vid}&maxResults=100&order=time&textFormat=plainText&key=${KEY}`,
  ).then((r) => r.json())
  for (const t of th.items ?? []) {
    const c = t.snippet.topLevelComment.snippet
    if (!c.authorDisplayName.includes(AUTHOR)) continue
    console.log('ролик :', it.snippet.title)
    console.log('videoId:', vid)
    console.log('threadId (=id верхнего комментария):', t.id)
    console.log('topLevelComment.id                :', t.snippet.topLevelComment.id)
    console.log('совпадают:', t.id === t.snippet.topLevelComment.id)
    console.log('текст  :', c.textDisplay.slice(0, 90))
    console.log('\nварианты ссылки:')
    console.log(`1 сейчас : https://www.youtube.com/watch?v=${vid}&lc=${t.id}&app=desktop`)
    console.log(`2 чистая : https://www.youtube.com/watch?v=${vid}&lc=${t.id}`)
    console.log(`3 канон  : https://www.youtube.com/watch?v=${vid}&lc=${t.snippet.topLevelComment.id}`)
    process.exit(0)
  }
}
console.log('не нашёл', AUTHOR)
