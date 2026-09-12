import { judgeAll } from './judge'
import { isOurLanguage } from './language'
import type { Prospect, ScanConfig, ScanResult } from './types'

/** Комментарий до оценки: всё поля лида, кроме балла и причины. */
type CommentRow = Omit<Prospect, 'score' | 'heat' | 'signals'>

const API = 'https://www.googleapis.com/youtube/v3/'

/** Quota cost per call, straight from the YouTube Data API docs. */
const COST = { search: 100, commentThreads: 1, channels: 1, playlistItems: 1 }

interface Counter {
  quota: number
}

async function call<T>(
  endpoint: keyof typeof COST,
  params: Record<string, string | number>,
  key: string,
  counter: Counter,
): Promise<T> {
  const qs = new URLSearchParams({ ...(params as Record<string, string>), key: String(key) })
  const res = await fetch(`${API}${endpoint}?${qs}`, { cache: 'no-store' })
  counter.quota += COST[endpoint]
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`${endpoint} ${res.status}: ${body.slice(0, 200)}`)
  }
  return res.json() as Promise<T>
}

/** Runs `jobs` with at most `limit` in flight — keeps us inside the function timeout. */
async function pooled<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = []
  let cursor = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor++
      out[i] = await worker(items[i])
    }
  })
  await Promise.all(runners)
  return out
}

interface SearchResponse {
  items?: {
    id: { videoId: string }
    snippet: { title: string; channelTitle: string; channelId: string }
  }[]
}

interface ThreadsResponse {
  items?: {
    id: string
    snippet: {
      totalReplyCount: number
      topLevelComment: {
        snippet: {
          textDisplay: string
          authorDisplayName: string
          authorChannelUrl?: string
          authorChannelId?: { value?: string }
          authorProfileImageUrl?: string
          publishedAt: string
          likeCount?: number
        }
      }
    }
  }[]
}

interface Video {
  id: string
  title: string
  channel: string
  /** Чтобы отличить комментарий автора ролика от комментария зрителя. */
  channelId: string
}

interface ChannelsResponse {
  items?: {
    id: string
    snippet?: { title: string }
    contentDetails?: { relatedPlaylists?: { uploads?: string } }
  }[]
}

interface PlaylistResponse {
  items?: {
    snippet: {
      title: string
      channelTitle: string
      channelId: string
      videoOwnerChannelId?: string
      resourceId: { videoId: string }
    }
  }[]
}

/**
 * Turns whatever the owner pasted into something the API understands:
 * a full URL, a bare @handle, or a raw channel id.
 */
export function parseChannelInput(raw: string): { kind: 'id' | 'handle' | 'user'; value: string } | null {
  const s = raw.trim().replace(/^@/, '@')
  if (!s) return null

  // Raw ids and handles typed without a URL
  if (/^UC[\w-]{20,}$/.test(s)) return { kind: 'id', value: s }
  if (/^@[\w.-]+$/.test(s)) return { kind: 'handle', value: s }

  let path: string
  try {
    const url = new URL(s.startsWith('http') ? s : `https://${s}`)
    if (!/(^|\.)youtube\.com$/.test(url.hostname)) return null
    path = url.pathname
  } catch {
    return null
  }

  const handle = path.match(/^\/(@[\w.-]+)/)
  if (handle) return { kind: 'handle', value: handle[1] }

  const id = path.match(/^\/channel\/(UC[\w-]+)/)
  if (id) return { kind: 'id', value: id[1] }

  const user = path.match(/^\/(?:user|c)\/([\w.-]+)/)
  if (user) return { kind: 'user', value: user[1] }

  return null
}

/** Resolves a channel to its uploads playlist, then lists its latest videos. */
async function videosFromChannel(
  raw: string,
  limit: number,
  key: string,
  counter: Counter,
): Promise<{ videos: Video[]; title: string | null; error: string | null }> {
  const parsed = parseChannelInput(raw)
  if (!parsed) {
    return { videos: [], title: null, error: `не похоже на ссылку канала: «${raw}»` }
  }

  const lookup: Record<string, string> =
    parsed.kind === 'id'
      ? { id: parsed.value }
      : parsed.kind === 'handle'
        ? { forHandle: parsed.value }
        : { forUsername: parsed.value }

  let channel: ChannelsResponse
  try {
    channel = await call<ChannelsResponse>(
      'channels',
      { part: 'snippet,contentDetails', ...lookup },
      key,
      counter,
    )
  } catch (e) {
    return { videos: [], title: null, error: `${raw}: ${(e as Error).message}` }
  }

  const found = channel.items?.[0]
  const uploads = found?.contentDetails?.relatedPlaylists?.uploads
  if (!uploads) {
    return { videos: [], title: null, error: `канал не найден: «${raw}»` }
  }

  try {
    const list = await call<PlaylistResponse>(
      'playlistItems',
      { part: 'snippet', playlistId: uploads, maxResults: Math.min(50, Math.max(1, limit)) },
      key,
      counter,
    )
    const videos = (list.items ?? []).map((it) => ({
      id: it.snippet.resourceId.videoId,
      title: it.snippet.title,
      channel: it.snippet.channelTitle,
      channelId: it.snippet.videoOwnerChannelId ?? it.snippet.channelId,
    }))
    return { videos, title: found?.snippet?.title ?? raw, error: null }
  } catch (e) {
    return { videos: [], title: null, error: `${raw}: ${(e as Error).message}` }
  }
}

export async function scan(config: ScanConfig, key: string): Promise<ScanResult> {
  const started = Date.now()
  const counter: Counter = { quota: 0 }
  const errors: string[] = []
  const since = new Date(Date.now() - config.days * 86_400_000)

  // ---- 1. find videos our audience is actually watching -------------------
  const videos = new Map<string, Video>()
  const searches = await pooled(config.queries, 4, async (q) => {
    try {
      const d = await call<SearchResponse>(
        'search',
        {
          part: 'snippet',
          q,
          type: 'video',
          maxResults: config.perQuery,
          // Ищем на двух языках: запрос на кириллице должен приводить русские
          // ролики, а не англоязычные с похожими словами.
          relevanceLanguage: /[Ѐ-ӿ]/.test(q) ? 'ru' : 'en',
          order: 'relevance',
        },
        key,
        counter,
      )
      return d.items ?? []
    } catch (e) {
      errors.push(`поиск «${q}»: ${(e as Error).message}`)
      return []
    }
  })
  for (const items of searches) {
    for (const it of items) {
      videos.set(it.id.videoId, {
        id: it.id.videoId,
        title: it.snippet.title,
        channel: it.snippet.channelTitle,
        channelId: it.snippet.channelId,
      })
    }
  }

  // ---- 1b. plus the channels the owner put on the watchlist ---------------
  const channelsRead: string[] = []
  const fromChannels = await pooled(config.channels, 4, (raw) =>
    videosFromChannel(raw, config.perQuery, key, counter),
  )
  for (const r of fromChannels) {
    if (r.error) errors.push(r.error)
    if (r.title) channelsRead.push(r.title)
    for (const v of r.videos) videos.set(v.id, v)
  }

  // ---- 2. read fresh comments under each one ------------------------------
  let commentsScanned = 0
  let freshComments = 0
  let videosRead = 0
  /** Всё свежее, что собрали. Балл появится ниже, после оценки моделью. */
  const candidates: CommentRow[] = []

  await pooled([...videos.values()], 8, async (v) => {
    let d: ThreadsResponse
    try {
      d = await call<ThreadsResponse>(
        'commentThreads',
        {
          part: 'snippet',
          videoId: v.id,
          maxResults: 100,
          order: 'time',
          textFormat: 'plainText',
        },
        key,
        counter,
      )
    } catch {
      return // comments disabled or video gone — normal, not worth reporting
    }
    videosRead++

    for (const th of d.items ?? []) {
      const c = th.snippet.topLevelComment.snippet
      commentsScanned++
      if (new Date(c.publishedAt) < since) continue
      freshComments++

      // Владельцы каналов закрепляют под своими роликами рекламу услуг —
      // это не лид, а конкурент.
      if (c.authorChannelId?.value && c.authorChannelId.value === v.channelId) continue

      const text = c.textDisplay.replace(/\s+/g, ' ').trim()
      if (!isOurLanguage(text)) continue

      candidates.push({
        id: th.id,
        text,
        author: c.authorDisplayName,
        authorChannel: c.authorChannelUrl ?? null,
        avatar: c.authorProfileImageUrl ?? null,
        publishedAt: c.publishedAt,
        likes: c.likeCount ?? 0,
        replies: th.snippet.totalReplyCount,
        videoId: v.id,
        videoTitle: v.title,
        channelTitle: v.channel,
        // `lc` makes YouTube scroll to the comment and highlight it; `app=desktop`
        // keeps mobile browsers on the web player, which is the only place
        // `lc` is honoured — the YouTube app silently ignores it.
        url: `https://www.youtube.com/watch?v=${v.id}&lc=${th.id}&app=desktop`,
      })
    }
  })

  // ---- 3. оценка: кто здесь клиент, решает модель -------------------------
  // Свежие вперёд: если комментариев больше потолка одного скана, отрезать надо
  // старые. Те, кого не успели посмотреть, вернутся следующим обходом — он
  // каждый час, а окно свежести в днях, так что лид не теряется.
  candidates.sort((a, b) => +new Date(b.publishedAt) - +new Date(a.publishedAt))

  const judged = await judgeAll(candidates)
  errors.push(...judged.errors)

  const prospects: Prospect[] = []
  for (const c of candidates) {
    const v = judged.verdicts.get(c.id)
    if (!v || v.score < config.minScore) continue
    prospects.push({ ...c, score: v.score, heat: v.heat, signals: v.signals })
  }

  prospects.sort(
    (a, b) => b.score - a.score || +new Date(b.publishedAt) - +new Date(a.publishedAt),
  )

  return {
    prospects,
    stats: {
      videosFound: videos.size,
      videosRead,
      commentsScanned,
      freshComments,
      judged: judged.asked,
      quotaUsed: counter.quota,
      tookMs: Date.now() - started,
      since: since.toISOString(),
      channelsRead,
    },
    errors,
  }
}
