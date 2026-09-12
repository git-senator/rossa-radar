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

/**
 * Каналы, отобранные разведкой: сначала считалась не популярность, а
 * разговорчивость — сколько комментариев приходится на тысячу просмотров.
 * Сверху англоязычные (аудитория на два порядка крупнее), ниже русские.
 */
export const DEFAULT_CHANNELS = [
  // — США: переезд в Бразилию, жизнь, недвижимость
  'https://www.youtube.com/@andysadventuresbrl',
  'https://www.youtube.com/@nordicinvestor',
  'https://www.youtube.com/@ourbrazilianlife',
  'https://www.youtube.com/@livingabroadwitheric',
  'https://www.youtube.com/@brazilusaconnection',
  'https://www.youtube.com/@travelingwithkristin',
  'https://www.youtube.com/@adventurefreaksss',
  'https://www.youtube.com/@gringorecifence',
  'https://www.youtube.com/@livingwiseglobal',
  'https://www.youtube.com/@raisingwildflowers',
  // — Канада: отъезд за границу и ранняя пенсия
  'https://www.youtube.com/@blueprint.financial',
  'https://www.youtube.com/@isagetslost',
  'https://www.youtube.com/@maiabundant',
  'https://www.youtube.com/@earlyretirementari',
  'https://www.youtube.com/@robyn_smith',
  'https://www.youtube.com/@nomadelite',
  'https://www.youtube.com/@moneywithmark69',
  // — русскоязычные, живут в Бразилии
  'https://www.youtube.com/@sizova_k',
  'https://www.youtube.com/@chechetkin_tut',
  'https://www.youtube.com/@taropizhka',
  'https://www.youtube.com/@kirill_brasil',
  'https://www.youtube.com/@balakina_brazil',
  'https://www.youtube.com/@lenainbrazil',
  'https://www.youtube.com/@geonevazhno',
  'https://www.youtube.com/@adveeenturers',
  'https://www.youtube.com/@lomfam',
  'https://www.youtube.com/@buzo',
  'https://www.youtube.com/@bitvalatam',
  // — русскоязычные сервисные: роды, ВНЖ, документы
  'https://www.youtube.com/@elenji_brazil',
  'https://www.youtube.com/@brazilpapa',
  'https://www.youtube.com/@svoibrazil',
  'https://www.youtube.com/@kamal_salbitti',
  'https://www.youtube.com/@katia.brazil',
  'https://www.youtube.com/@dyakonovm',
  // — конкуренты: продают недвижимость в Бразилии русским
  'https://www.youtube.com/@invest_in_brazil',
  'https://www.youtube.com/@legacy_house_brazil',
  // — соседние темы: эмиграция и Латинская Америка вообще
  'https://www.youtube.com/@vadim_from_uru',
  'https://www.youtube.com/@mashkevichlife',
  'https://www.youtube.com/@shotaowl',
  'https://www.youtube.com/@nestrashno',
  'https://www.youtube.com/@varlamov.travel',
  'https://www.youtube.com/@jastravelalex',
  'https://www.youtube.com/@vova.karmanov',
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
