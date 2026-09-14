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
    /** Сколько свежих комментариев дошло до модели после грубого отсева. */
    judged: number
    quotaUsed: number
    tookMs: number
    since: string
    /** Channels that resolved, so the owner can see the watchlist worked */
    channelsRead: string[]
  }
  errors: string[]
}

/** Покупатель приходит из США и Канады, поэтому запросы только английские. */
export const DEFAULT_QUERIES = [
  'buying property in Brazil as a foreigner',
  'Brazil permanent residency visa American',
  'moving to Argentina from USA expat',
  'buying real estate in Argentina foreigner',
  'Paraguay residency for Americans',
  'living in Paraguay expat cost of living',
  'retire in South America American expat',
  'invest in South America real estate foreigner',
]

/**
 * Англоязычные каналы из США и Канады, где живые люди обсуждают переезд,
 * недвижимость, инвестиции и ВНЖ в Бразилии, Аргентине и Парагвае. Список
 * собран замером: страна канала, свежесть роликов, доля названий про наши
 * три страны и число комментариев под последними выпусками.
 */
export const DEFAULT_CHANNELS = [
  // — три от владельца, живые
  'https://www.youtube.com/@nordicinvestor',
  'https://www.youtube.com/@andysadventuresbrl',
  'https://www.youtube.com/@livingabroadwitheric',
  // — три самых результативных по замеру
  'https://www.youtube.com/@graemelamperson91',
  'https://www.youtube.com/@paraguaymike5159',
  'https://www.youtube.com/@growabroadre',
]

export const DEFAULT_CONFIG: ScanConfig = {
  // Пусто намеренно: список каналов уже собран поиском, а каждый запрос
  // стоит 100 единиц против 2 за канал. Добавлять — по необходимости,
  // подсказки лежат в поле ввода.
  queries: [],
  channels: DEFAULT_CHANNELS,
  days: 30,
  perQuery: 15,
  minScore: 25,
}
