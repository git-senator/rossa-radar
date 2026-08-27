import { classify, isOurLanguage } from './classify'
import type { Prospect, ScanConfig, ScanResult } from './types'

const API = 'https://www.googleapis.com/youtube/v3/'

/** Quota cost per call, straight from the YouTube Data API docs. */
const COST = { search: 100, commentThreads: 1 }

interface Counter {
  quota: number
}

async function call<T>(
  endpoint: 'search' | 'commentThreads',
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
    snippet: { title: string; channelTitle: string }
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
          relevanceLanguage: 'en',
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
      })
    }
  }

  // ---- 2. read fresh comments under each one ------------------------------
  let commentsScanned = 0
  let freshComments = 0
  let videosRead = 0
  const prospects: Prospect[] = []

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

      const text = c.textDisplay.replace(/\s+/g, ' ').trim()
      if (!isOurLanguage(text)) continue

      const { score, heat, signals } = classify(text)
      if (score < config.minScore) continue

      prospects.push({
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
        url: `https://www.youtube.com/watch?v=${v.id}&lc=${th.id}`,
        score,
        heat,
        signals,
      })
    }
  })

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
      quotaUsed: counter.quota,
      tookMs: Date.now() - started,
      since: since.toISOString(),
    },
    errors,
  }
}
