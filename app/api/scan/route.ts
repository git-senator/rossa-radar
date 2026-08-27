import { scan } from '@/lib/youtube'
import { DEFAULT_CONFIG, type ScanConfig } from '@/lib/types'

/** The scan makes ~70 upstream calls; give it room. */
export const maxDuration = 60
export const dynamic = 'force-dynamic'

function clamp(n: unknown, lo: number, hi: number, fallback: number): number {
  const v = typeof n === 'number' && Number.isFinite(n) ? n : fallback
  return Math.max(lo, Math.min(hi, Math.round(v)))
}

export async function POST(request: Request) {
  const key = process.env.YOUTUBE_API_KEY
  if (!key) {
    return Response.json(
      { error: 'YOUTUBE_API_KEY не задан. Добавьте его в переменные окружения проекта.' },
      { status: 500 },
    )
  }

  let body: Partial<ScanConfig> = {}
  try {
    body = (await request.json()) as Partial<ScanConfig>
  } catch {
    // empty body is fine — fall back to defaults
  }

  const queries = Array.isArray(body.queries)
    ? body.queries.map((q) => String(q).trim()).filter(Boolean).slice(0, 12)
    : DEFAULT_CONFIG.queries

  if (queries.length === 0) {
    return Response.json({ error: 'Нужен хотя бы один поисковый запрос.' }, { status: 400 })
  }

  const config: ScanConfig = {
    queries,
    days: clamp(body.days, 1, 365, DEFAULT_CONFIG.days),
    perQuery: clamp(body.perQuery, 1, 25, DEFAULT_CONFIG.perQuery),
    minScore: clamp(body.minScore, 0, 100, DEFAULT_CONFIG.minScore),
  }

  try {
    const result = await scan(config, key)
    return Response.json(result)
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 })
  }
}
