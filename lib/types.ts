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
  /** How many days back to accept comments */
  days: number
  /** Videos pulled per query (each search costs 100 quota units) */
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
  }
  errors: string[]
}

export const DEFAULT_QUERIES = [
  'retire in Brazil',
  'moving to Brazil from USA',
  'cost of living in Brazil',
  'buying property in Brazil foreigner',
  'living in Florianopolis Brazil expat',
  'Brazil beach town expat retire',
  'why I moved to Brazil American',
  'Brazil real estate market foreigners',
]

export const DEFAULT_CONFIG: ScanConfig = {
  queries: DEFAULT_QUERIES,
  days: 30,
  perQuery: 10,
  minScore: 25,
}
