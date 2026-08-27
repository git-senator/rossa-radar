export const maxDuration = 60
export const dynamic = 'force-dynamic'

const DEFAULT_BASE = 'https://api.groq.com/openai/v1'
const DEFAULT_MODEL = 'llama-3.3-70b-versatile'

/** Comments are short; a dozen per request keeps latency low and output valid. */
const BATCH = 12

interface Item {
  id: string
  text: string
}

const SYSTEM = `Ты переводчик. Переводишь комментарии с YouTube на русский язык.

Правила:
- Переводи смысл, а не слова. Это живая разговорная речь с опечатками и сленгом — передавай её естественным русским.
- Сохраняй тон: восторженный остаётся восторженным, злой — злым.
- Имена, названия городов и каналов не переводи.
- Ничего не добавляй и не сокращай. Никаких пояснений.

Ответь ТОЛЬКО объектом JSON вида {"переводы":{"<id>":"<перевод>", ...}} и ничем больше.`

async function translateBatch(
  items: Item[],
  key: string,
  base: string,
  model: string,
): Promise<Record<string, string>> {
  const payload = items.map((i) => ({ id: i.id, text: i.text }))

  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      max_tokens: 4000,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: JSON.stringify(payload) },
      ],
    }),
    cache: 'no-store',
  })

  if (!res.ok) {
    throw new Error(`Переводчик ${res.status}: ${(await res.text()).slice(0, 200)}`)
  }

  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
  const raw = data.choices?.[0]?.message?.content ?? '{}'

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return {}
  }

  const box = parsed as Record<string, unknown>
  // The model is told to use "переводы", but accept the obvious variants too.
  const dict = (box.переводы ?? box.translations ?? box) as Record<string, unknown>
  const out: Record<string, string> = {}
  for (const item of items) {
    const v = dict?.[item.id]
    if (typeof v === 'string' && v.trim()) out[item.id] = v.trim()
  }
  return out
}

export async function POST(request: Request) {
  const key = process.env.TRANSLATE_API_KEY
  if (!key) {
    return Response.json(
      { error: 'TRANSLATE_API_KEY не задан — перевод отключён.' },
      { status: 503 },
    )
  }
  const base = process.env.TRANSLATE_API_BASE || DEFAULT_BASE
  const model = process.env.TRANSLATE_MODEL || DEFAULT_MODEL

  let items: Item[] = []
  try {
    const body = (await request.json()) as { items?: Item[] }
    items = (body.items ?? [])
      .filter((i) => i && typeof i.id === 'string' && typeof i.text === 'string')
      .slice(0, 60)
  } catch {
    return Response.json({ error: 'Неверный запрос.' }, { status: 400 })
  }

  if (items.length === 0) return Response.json({ translations: {} })

  const chunks: Item[][] = []
  for (let i = 0; i < items.length; i += BATCH) chunks.push(items.slice(i, i + BATCH))

  try {
    const results = await Promise.all(
      chunks.map((c) => translateBatch(c, key, base, model)),
    )
    return Response.json({ translations: Object.assign({}, ...results) as Record<string, string> })
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 })
  }
}
