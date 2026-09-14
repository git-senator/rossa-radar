import type { Heat } from './types'

/**
 * Оценка комментариев моделью.
 *
 * До этого решали правила на регулярках, и они врали. В JavaScript `\b` и `\w`
 * знают только латиницу: `/\bхочу/` не совпадает с «я хочу», а `/планиру\w*\s/`
 * — с «планирую купить». Половина русских правил не срабатывала никогда, и
 * «Я хочу купить квартиру в Бразилии» получало ноль. Живая речь вообще плохо
 * ложится на регулярки: «вот бы нам туда, да денег бы хватило» не поймает
 * никакое правило.
 *
 * Теперь решает модель — она видит смысл, а не буквы, и работает на любом языке.
 *
 * Регулярка осталась ровно одна, в `worthAsking`, и у неё обратная задача: не
 * отобрать лидов, а отбросить заведомо пустое, чтобы влезть в лимит токенов.
 */

const DEFAULT_BASE = 'https://api.groq.com/openai/v1'
const DEFAULT_MODEL = 'openai/gpt-oss-120b'

/**
 * Дюжина за запрос — компромисс, найденный замерами. Крупнее: ответный JSON не
 * влезает в отведённые токены и обрывается на середине, сервис возвращает 400.
 * Мельче: системная подсказка уходит с каждым запросом и умножается на их число.
 */
const BATCH = 12

/** Два запроса разом. Больше — упираемся не в Vercel, а в лимит токенов. */
const PARALLEL = 2

/** Дольше не ждём: лучше отдать часть, чем словить таймаут функции. */
const BUDGET_MS = 35_000

/** Комментарии длиннее обрезаем: смысл виден в начале, токены не бесконечны. */
const MAX_CHARS = 700

/** Короткие реплики — «спасибо», «❤❤❤» — спрашивать не о чем. */
const MIN_CHARS = 25

/** Потолок на один скан, чтобы минутный лимит не кончился на первой пачке. */
const MAX_JUDGED = 400

/**
 * Единственный грубый отсев перед моделью: в комментарии должно быть хоть одно
 * слово про переезд, покупку, деньги или документы — на любом из трёх языков.
 *
 * Это фильтр на полноту, а не на точность. Он не пытается понять, кто здесь
 * клиент: достаточно одного слова в любом месте текста, без порядка слов, без
 * расстояний и без `\b` рядом с кириллицей — ровно на этом и ломались прежние
 * правила. На живом корпусе из 517 комментариев остаётся около сорока, и все
 * известные лиды в них сохраняются.
 */
const TOPICAL =
  /(plan|planning|want|thinking|consider|hoping|looking|move|moving|relocat|retir|emigrat|immigrat|expat|nomad|buy|buying|purchase|afford|budget|price|cost|mortgage|invest|\brent\b|rental|renting|lease|propert|real estate|apartment|condo|\bland\b|acre|farm|visa|citizenship|residen|passport|how (much|do|can|would)|переезд|переехать|перебра|релокац|хочу|хотим|планиру|собира|думаю|ищу|подыскива|куплю|купить|приобрест|инвест|вложит|недвиж|квартир|жиль|участок|аренд|снять|сколько стоит|сколько будет|цена|цены|почём|бюджет|подскажите|реально ли|как получить|внж|гражданств|пенси)/i

/**
 * Коротко намеренно: подсказка уходит с каждой пачкой, а на бесплатном Groq
 * всего 8 000 токенов в минуту. Каждая лишняя строка здесь умножается на число
 * запросов и съедает те комментарии, которые иначе успели бы оценить.
 */
const SYSTEM = `Ты — агент, который квалифицирует лидов. Агентство помогает иностранцам купить или арендовать недвижимость, вложить деньги и получить ВНЖ или гражданство в Бразилии, Аргентине и Парагвае.

Поставь каждому комментарию балл 0-100: насколько его автор — потенциальный клиент.

Квалифицирован (60-100), если человек пишет о себе и намерен хоть что-то из этого:
- купить или арендовать жильё, землю, помещение;
- вложить деньги, открыть бизнес, взять объект под сдачу;
- получить ВНЖ, резидентство, гражданство или второй паспорт;
- переехать или выйти на пенсию в одной из трёх стран.
Сюда же — деловой вопрос по существу: цены, условия для иностранцев, порядок и сроки оформления, бюджет, просьба связаться.

30-59: намерение личное, но размытое — «когда-нибудь хочу», ещё выбирает страну.

0-29: не о себе или не наш человек.

Правила:
- Страны только три: Бразилия, Аргентина, Парагвай. Мексика, Уругвай, Колумбия, Коста-Рика и прочие — не наши, даже если намерение настоящее.
- Кто уже переехал и уже всё оформил и теперь объясняет другим, как это делается, — советчик, а не клиент. Это 0, каким бы подробным ни был рассказ.
- Вопрос автору ролика про его собственную жизнь («а какую визу ТЫ делаешь?») — не заявка о себе.
- Местные жители, спорщики, шутки и подколы автора, похвала ролику, реклама своих услуг, риелторы и конкуренты — 0.
- Упоминание покупки или аренды внутри насмешки или спора намерением не считается.
- Язык любой. Название ролика дано как контекст.
- Нет личного намерения — ставь 0, а не 20.

«почему» — одна короткая фраза по-русски, не длиннее восьми слов: что за намерение и по какой стране.

Ответь ТОЛЬКО объектом JSON вида {"оценки":{"<id>":{"балл":<число>,"почему":"<фраза>"}}} и оцени каждый комментарий.`

export interface Verdict {
  score: number
  heat: Heat
  signals: string[]
}

export interface Candidate {
  id: string
  text: string
  /** Название ролика — модели нужен контекст, о какой стране речь. */
  videoTitle: string
}

/** Стоит ли вообще спрашивать модель про этот комментарий. */
export function worthAsking(text: string): boolean {
  return text.length >= MIN_CHARS && TOPICAL.test(text)
}

function heatOf(score: number): Heat {
  return score >= 60 ? 'hot' : score >= 38 ? 'warm' : 'cold'
}

interface Config {
  key: string
  base: string
  model: string
}

function config(): Config {
  // Отдельные JUDGE_*, если оценку захочется развести с переводом по моделям;
  // по умолчанию берём то же, на чём работает перевод.
  const key = process.env.JUDGE_API_KEY || process.env.TRANSLATE_API_KEY
  if (!key) {
    throw new Error(
      'Нужен JUDGE_API_KEY или TRANSLATE_API_KEY — без модели оценивать комментарии нечем.',
    )
  }
  return {
    key,
    base: process.env.JUDGE_API_BASE || process.env.TRANSLATE_API_BASE || DEFAULT_BASE,
    model: process.env.JUDGE_MODEL || process.env.TRANSLATE_MODEL || DEFAULT_MODEL,
  }
}

/** Сколько ждать после отказа по лимиту. Сервис сам говорит, сколько. */
function retryAfterMs(res: Response): number {
  const header = res.headers.get('retry-after') ?? res.headers.get('x-ratelimit-reset-tokens')
  if (!header) return 4000
  const seconds = Number.parseFloat(header.replace(/[^\d.]/g, ''))
  return Number.isFinite(seconds) ? Math.min(20_000, Math.max(1000, seconds * 1000)) : 4000
}

/**
 * Рассуждающие модели тратят на внутренние размышления ту же квоту, что и на
 * ответ. У gpt-oss-120b из 1280 отведённых токенов 1143 уходило на рассуждения,
 * и на сам JSON оставалось меньше полутора сотен: ответ обрывался на четвёртой
 * оценке из двенадцати, а иногда посреди строки — тогда сервис возвращал 400.
 * С низким усилием рассуждения занимают ~220 токенов, ответ помещается целиком
 * и приходит вдвое быстрее. Работа здесь простая, глубоко думать не над чем.
 *
 * Параметр понимают не все совместимые сервисы, поэтому при отказе именно из-за
 * него переключаемся на запросы без него и больше не пробуем.
 */
let reasoningEffort: 'low' | null = 'low'

async function ask(batch: Candidate[], cfg: Config): Promise<Response> {
  const payload = batch.map((c) => ({
    id: c.id,
    ролик: c.videoTitle.slice(0, 120),
    комментарий: c.text.slice(0, MAX_CHARS),
  }))

  return fetch(`${cfg.base}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.key}` },
    body: JSON.stringify({
      model: cfg.model,
      temperature: 0,
      ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
      // Groq вычитает из минутного лимита заявленный max_tokens, а не
      // фактическую длину ответа. Со «щедрым» запасом два параллельных запроса
      // съедали все 8 000 ещё до того, как модель успевала ответить. Считаем по
      // размеру пачки: на комментарий уходит балл и короткая фраза.
      max_tokens: 200 + batch.length * 90,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: JSON.stringify(payload) },
      ],
    }),
    cache: 'no-store',
  })
}

async function judgeBatch(
  batch: Candidate[],
  cfg: Config,
  deadline: number,
): Promise<Map<string, Verdict>> {
  let res = await ask(batch, cfg)

  // Минутный лимит токенов — штатная ситуация, а не поломка: подождём и
  // спросим ещё раз, если на это осталось время.
  if (res.status === 429) {
    const wait = retryAfterMs(res)
    if (Date.now() + wait > deadline) {
      throw new Error('лимит токенов, ждать дольше бюджета скана')
    }
    await new Promise((r) => setTimeout(r, wait))
    res = await ask(batch, cfg)
  }

  if (!res.ok) {
    const body = await res.text()
    // Сервис не знает про reasoning_effort — снимаем его и спрашиваем заново.
    if (res.status === 400 && /reasoning_effort/i.test(body) && reasoningEffort) {
      reasoningEffort = null
      res = await ask(batch, cfg)
      if (!res.ok) {
        throw new Error(`оценка ${res.status}: ${(await res.text()).slice(0, 160)}`)
      }
    } else {
      throw new Error(`оценка ${res.status}: ${body.slice(0, 160)}`)
    }
  }

  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
  let parsed: unknown
  try {
    parsed = JSON.parse(data.choices?.[0]?.message?.content ?? '{}')
  } catch {
    throw new Error('модель ответила не JSON')
  }

  const box = parsed as Record<string, unknown>
  const dict = (box.оценки ?? box.scores ?? box) as Record<string, unknown>

  const out = new Map<string, Verdict>()
  for (const c of batch) {
    const row = dict?.[c.id] as Record<string, unknown> | undefined
    if (!row) continue
    const score = Math.round(Number(row.балл ?? row.score))
    if (!Number.isFinite(score)) continue
    const why = String(row.почему ?? row.why ?? '').trim()
    out.set(c.id, {
      score: Math.max(0, Math.min(100, score)),
      heat: heatOf(Math.max(0, Math.min(100, score))),
      signals: why ? [why] : [],
    })
  }
  return out
}

export interface JudgeResult {
  verdicts: Map<string, Verdict>
  errors: string[]
  /**
   * Сколько комментариев модель реально оценила — не сколько отправили. Разница
   * важная: при обрыве ответа половина пачки остаётся без вердикта, и если
   * показывать отправленные, потеря выглядит как успешная работа.
   */
  judged: number
}

/**
 * Оценивает комментарии. Сбой отдельной пачки не валит обход: неоценённое
 * вернётся нулём, причина попадёт в `errors`, а сами комментарии пересмотрит
 * следующий обход — он идёт каждый час, окно свежести в днях, так что лид
 * не теряется.
 */
export async function judgeAll(candidates: Candidate[]): Promise<JudgeResult> {
  const cfg = config()
  const verdicts = new Map<string, Verdict>()
  const errors: string[] = []

  const worth = candidates.filter((c) => worthAsking(c.text))
  const overflow = Math.max(0, worth.length - MAX_JUDGED)
  const queue = worth.slice(0, MAX_JUDGED)

  const batches: Candidate[][] = []
  for (let i = 0; i < queue.length; i += BATCH) batches.push(queue.slice(i, i + BATCH))

  const deadline = Date.now() + BUDGET_MS
  let cursor = 0
  let unseen = 0

  await Promise.all(
    Array.from({ length: Math.min(PARALLEL, batches.length) }, async () => {
      while (cursor < batches.length) {
        const batch = batches[cursor++]
        if (Date.now() > deadline) {
          unseen += batch.length
          continue
        }
        try {
          for (const [id, v] of await judgeBatch(batch, cfg, deadline)) verdicts.set(id, v)
        } catch (e) {
          unseen += batch.length
          errors.push((e as Error).message)
        }
      }
    }),
  )

  if (unseen > 0) errors.push(`не оценено комментариев: ${unseen}`)
  if (overflow > 0) errors.push(`сверх потолка ${MAX_JUDGED} отложено: ${overflow}`)

  // Одинаковые сбои пачек схлопываем — в логе хватит строки на причину.
  const seen = new Set<string>()
  return {
    verdicts,
    errors: errors.filter((e) => (seen.has(e) ? false : (seen.add(e), true))),
    judged: verdicts.size,
  }
}
