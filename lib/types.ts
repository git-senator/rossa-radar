export type Heat = 'hot' | 'warm' | 'cold'

export interface Prospect {
  /** YouTube comment id — stable, used as the dedupe and status key */
  id: string
  text: string
  author: string
  authorChannel: string | null
  avatar: string | null
  publishedAt: string
  likes: number
  replies: number
  videoId: string
  videoTitle: string
  channelTitle: string
  /** Deep link that opens the comment highlighted (browser only, not the app) */
  url: string
  score: number
  heat: Heat
  /** Human-readable reasons the score came out this way */
  signals: string[]
}

export interface ScanConfig {
  queries: string[]
  /**
   * Channels to watch, as the owner pasted them: a full URL, a @handle or a
   * raw channel id. Reading a channel's uploads costs 2 quota units against
   * a search's 100, so a watchlist is the cheap way to widen the radar.
   */
  channels: string[]
  /** How many days back to accept comments */
  days: number
  /** Videos pulled per source — per query and per channel alike */
  perQuery: number
  /** Drop anything scoring below this */
  minScore: number
}

export interface ScanResult {
  prospects: Prospect[]
  stats: {
    videosFound: number
    videosRead: number
    commentsScanned: number
    freshComments: number
    quotaUsed: number
    tookMs: number
    since: string
    /** Channels that resolved, so the owner can see the watchlist worked */
    channelsRead: string[]
  }
  errors: string[]
}

/** Два языка, на которых ищем покупателей: английский и русский. */
export const DEFAULT_QUERIES = [
  'retire in Brazil',
  'moving to Brazil from USA',
  'cost of living in Brazil',
  'buying property in Brazil foreigner',
  'living in Florianopolis Brazil expat',
  'why I moved to Brazil American',
  'переезд в Бразилию',
  'жизнь в Бразилии цены',
  'недвижимость в Бразилии для иностранцев',
  'ВНЖ Бразилия как получить',
]

/** Channels the recon turned up as the places our buyers actually gather. */
export const DEFAULT_CHANNELS: string[] = []

export const DEFAULT_CONFIG: ScanConfig = {
  queries: DEFAULT_QUERIES,
  channels: DEFAULT_CHANNELS,
  days: 30,
  perQuery: 10,
  minScore: 25,
}
