/** Разовая проверка списка каналов: node scripts/try-watchlist.mjs */
const CHANNELS = [...new Set([
  '@bitvalatam', '@elenji_brazil', '@sizova_k', '@vadim_from_uru', '@mashkevichlife',
  '@shotaowl', '@nestrashno', '@varlamov.travel', '@jastravelalex', '@vova.karmanov',
  '@invest_in_brazil', '@legacy_house_brazil', '@brazilpapa', '@svoibrazil',
  '@kamal_salbitti', '@katia.brazil', '@dyakonovm', '@chechetkin_tut', '@taropizhka',
  '@kirill_brasil', '@balakina_brazil', '@lenainbrazil', '@geonevazhno',
  '@adveeenturers', '@lomfam', '@buzo',
])].map((h) => `https://www.youtube.com/${h}`)

const URL = process.env.RADAR_URL ?? 'https://rossa-radar.vercel.app'
const started = Date.now()

const res = await fetch(`${URL}/api/scan`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    queries: [],
    channels: CHANNELS,
    days: Number(process.env.DAYS ?? 30),
    perQuery: Number(process.env.PER ?? 15),
    minScore: Number(process.env.MIN ?? 25),
  }),
})

const d = await res.json()
if (!res.ok) {
  console.error(res.status, d)
  process.exit(1)
}

console.log(`каналов отправлено: ${CHANNELS.length}`)
console.log(`ответ за ${((Date.now() - started) / 1000).toFixed(1)} с`)
console.log(JSON.stringify(d.stats, null, 1))
if (d.errors?.length) console.log('СБОИ:\n  ' + d.errors.join('\n  '))
console.log(`\nнайдено: ${d.prospects.length}`)
for (const p of d.prospects.slice(0, 12)) {
  console.log(`\n[${p.score} ${p.heat}] ${p.author} · ${p.publishedAt.slice(0, 10)}`)
  console.log(`  ${p.signals.join(', ')}`)
  console.log(`  ${p.text.slice(0, 200)}`)
  console.log(`  под «${p.videoTitle.slice(0, 60)}» — ${p.channelTitle}`)
}
