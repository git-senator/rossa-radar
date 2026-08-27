import type { Heat } from './types'

/**
 * Scores a YouTube comment for how likely its author is a real prospect —
 * someone who wants to move to or buy property in Brazil.
 *
 * The weights come from reading 512 real comments by hand: the loud majority
 * are locals arguing about gentrification and sceptics debating yields, and a
 * naive keyword match drowns the handful of actual buyers in that noise.
 * So negative signals are weighted as heavily as positive ones.
 */

interface Rule {
  re: RegExp
  points: number
  label: string
}

const RULES: Rule[] = [
  // ---- the strongest thing a stranger can do: ask to be contacted ----
  {
    re: /(can i (get|have) (your|the) (e-?mail|contact|number|whats ?app)|do you (offer|do|provide) (consultation|consulting|service|coaching)|how (can|do) i (contact|reach) you|dm me|email me|reach out to me|please contact me|send me (your|the) (e-?mail|contact|info))/i,
    points: 42,
    label: 'просит связаться',
  },
  // ---- explicit forward-looking purchase ----
  {
    re: /\b(i|we|my (wife|husband|family))\b[^.!?]{0,70}\b(plan|planning|want|wanting|hope|hoping|intend|looking|going|about)\b[^.!?]{0,40}\b(to )?(buy|purchase|invest in|acquire)\b/i,
    points: 38,
    label: 'планирует покупку',
  },
  {
    re: /\b(looking|searching|shopping|hunting) (for|at)\b[^.!?]{0,40}\b(propert|apartment|apto|condo|house|home|land|lot|villa|beachfront|real estate|flat)/i,
    points: 30,
    label: 'ищет объект',
  },
  // ---- explicit forward-looking relocation ----
  {
    re: /\b(i|we|my (wife|husband|family))\b[^.!?]{0,60}\b(am|are|'m|'re)?\s*(plan\w*|moving|relocat\w+|retiring|emigrat\w+)\b[^.!?]{0,40}\b(to|in)\b[^.!?]{0,25}(brazil|brasil|floripa|florian|salvador|bahia|natal|joao pessoa|recife|fortaleza|santa catarina|balneario)/i,
    points: 34,
    label: 'планирует переезд',
  },
  {
    re: /\b(i|we)\b[^.!?]{0,40}\b(plan|planning|thinking about|considering|hoping|want|intend)\b[^.!?]{0,30}\b(to )?(move|relocate|retire|emigrate|come|live)\b/i,
    points: 24,
    label: 'думает о переезде',
  },
  // ---- a real date makes a prospect actionable ----
  {
    re: /\b(next (year|month|spring|summer|fall|winter)|in \d{1,2} (months?|years?|weeks?)|by (the end of )?\d{4}|in (january|february|march|april|may|june|july|august|september|october|november|december)|this (fall|spring|summer|winter)|retire in \w+)\b/i,
    points: 22,
    label: 'назван срок',
  },
  // ---- money on the table ----
  {
    re: /(\$\s?\d[\d,.]*\s?(k|m|thousand|million)?|\bR\$\s?\d|\b\d{2,3}\s?k\s?(usd|dollars)|\bbudget\b|\bafford\b|\bsavings\b|\bpension\b|\bsocial security\b|\b401k\b)/i,
    points: 16,
    label: 'считает деньги',
  },
  // ---- asks the community something concrete ----
  {
    re: /\?/,
    points: 9,
    label: 'задаёт вопрос',
  },
  {
    re: /\b(which|what|where) (city|area|region|neighborhood|town|state|part)\b|\bwhere (should|would|do you) (i|we|you)\b|\brecommend\b/i,
    points: 14,
    label: 'выбирает место',
  },
  // ---- family raises the ticket and the seriousness ----
  {
    re: /\b(my (wife|husband|kids|children|son|daughter|family)|with my (wife|husband|family)|our (son|daughter|kids|children))\b/i,
    points: 8,
    label: 'переезжает с семьёй',
  },
  // ---- clearly a foreigner, which is our whole market ----
  {
    re: /\b(i'?m|i am|we'?re|we are)\s(an?\s)?(american|canadian|british|brit|dutch|german|australian|from (the )?(us|usa|uk|states|canada|netherlands|germany|australia)|based in (the )?(us|usa|uk))/i,
    points: 12,
    label: 'иностранец',
  },
  {
    re: /\b(i|we)('| ha)?ve (lived|been living) (in|near) (california|texas|florida|new york|arizona|colorado|nevada|oregon|washington|chicago|boston|america|the (us|usa|states|uk|netherlands|uk))/i,
    points: 12,
    label: 'иностранец',
  },
  // Retirement with a date is the single best predictor in this audience.
  {
    re: /\b(about to|going to|will|i|we)\s?(am|are)?\s?retir(e|ing)\b|\bwhen i retire\b|\bmy retirement\b/i,
    points: 18,
    label: 'скоро на пенсию',
  },

  // ================= negative =================
  // Locals telling foreigners to stay away — the loudest group in the data.
  {
    re: /\b(don'?t come|do not come|stay away|go back|you'?re not welcome|unwelcome|disgusting|gringo|colonizer|gentrif\w+|ruining|destroying (our|the)|it'?s a lie|fucked up|what happened to the american dream|don'?t advertise)\b|\blocals? (can'?t|cannot)\b|\bnow you come here\b/i,
    points: -55,
    label: 'враждебный комментарий',
  },
  // Sceptics arguing against the thesis — reads like intent to a keyword matcher.
  {
    re: /\b(i would never|wouldn'?t invest|bad (idea|investment|advice)|terrible (advice|idea)|can'?t understand why|makes no sense|scam|misleading|nonsense|overrated)\b/i,
    points: -40,
    label: 'спорит, не покупает',
  },
  // Already settled — a customer for nothing.
  {
    re: /\b(i (have )?lived here|i'?ve been (living |here )|i moved (here|to brazil) in \d{4}|been here (for )?\d+ (years?|months?)|i'?m brazilian|i am brazilian|sou brasileiro)\b/i,
    points: -22,
    label: 'уже живёт в Бразилии',
  },
  // Channel plugs and spam.
  {
    re: /(subscribe to|check out my|my channel|https?:\/\/|t\.me\/|wa\.me\/|@[a-z0-9_]+ (channel|travel))/i,
    points: -30,
    label: 'самореклама',
  },
  // Generic advice aimed at other viewers, not a personal plan.
  {
    re: /^(if you|for those who|anyone who|people should|you should|search for)\b/i,
    points: -18,
    label: 'совет другим, не о себе',
  },

  // ================= русский =================
  // Наши покупатели говорят не только по-английски: часть аудитории приходит
  // с русскоязычных каналов про Латинскую Америку. Метки те же, что у
  // английских правил, поэтому одно и то же намерение не считается дважды.
  {
    re: /(как (с вами )?связаться|можно ваш (контакт|телеф|номер|ватсап|whats)|напишите мне|скиньте контакт|дайте контакт|есть ли у вас консультаци|телефон для связи|как вас найти)/i,
    points: 42,
    label: 'просит связаться',
  },
  {
    re: /\b(хочу|хотим|планиру|собира|думаю|решил|намерен)\w*\s+(\S+\s+){0,3}?(купить|приобрести|взять|инвестировать|вложить)/i,
    points: 38,
    label: 'планирует покупку',
  },
  {
    re: /(ищу|ищем|подбира\w+|присматрива\w+)\s+(\S+\s+){0,3}?(квартир|дом|апартамент|жиль[её]|недвижимост|участок|виллу|студию)/i,
    points: 30,
    label: 'ищет объект',
  },
  {
    re: /\b(хочу|хотим|планиру|собира|готов\w*)\w*\s+(\S+\s+){0,3}?(переехать|перебраться|уехать|релокейт|переезд)/i,
    points: 34,
    label: 'планирует переезд',
  },
  {
    re: /(думаю|подумыва\w+|рассматрива\w+|присматрива\w+)\s+(\S+\s+){0,3}?(переезд|переехать|о бразилии|вариант)/i,
    points: 24,
    label: 'думает о переезде',
  },
  {
    re: /(в следующем (году|месяце)|через \d+ (месяц\w*|год\w*|недел\w*)|весной|летом|осенью|зимой|к (концу|началу) года|в \d{4} году)/i,
    points: 22,
    label: 'назван срок',
  },
  {
    re: /(сколько стоит|какая цена|цены на|по деньгам|бюджет|\d+\s?(тыс|тысяч|к)\s?(\$|долл|евро|рубл)|\$\s?\d|хватит ли)/i,
    points: 16,
    label: 'считает деньги',
  },
  {
    re: /(в каком (городе|районе)|куда лучше|где лучше|что посоветуете|какой (город|район) выбрать|подскажите куда)/i,
    points: 14,
    label: 'выбирает место',
  },
  {
    re: /(с (женой|мужем|семь[её]й|детьми|ребенком|ребёнком)|у меня (двое|трое|дети|ребен|ребён)|наши дети)/i,
    points: 8,
    label: 'переезжает с семьёй',
  },
  {
    re: /\b(на пенси|пенсионер|выхожу на пенсию|после выхода на пенсию)/i,
    points: 18,
    label: 'скоро на пенсию',
  },
  // --- отрицательные ---
  {
    re: /(не советую|не стоит (туда|ехать|покупать)|обман|развод|кидалов|враньё|вранье|ерунда|бред|чушь|разводят|не ведитесь)/i,
    points: -40,
    label: 'спорит, не покупает',
  },
  {
    re: /(я (тут|здесь) (уже )?(живу|прожил)|живу (тут|здесь|в бразилии) (уже )?\d|переехал(а)? (сюда|в бразилию) в \d{4})/i,
    points: -22,
    label: 'уже живёт в Бразилии',
  },
  {
    re: /(подпис\w+ на (мой|наш) канал|мой канал|наш телеграм|пишите в личку.*канал)/i,
    points: -30,
    label: 'самореклама',
  },
]

const PORTUGUESE =
  /\b(voc[eê]|obrigad[oa]|muito|gente|n[aã]o|aqui|ent[aã]o|tamb[eé]m|porque|sou|est[aá]|bom dia|boa noite|valeu|cara|mano|pra|pro)\b/gi

/**
 * English and Russian both stay: the buyers come from US channels and from
 * Russian-language ones about Latin America alike. Portuguese-heavy comments
 * are dropped — those are locals, and the loudest of them are hostile.
 */
export function isOurLanguage(text: string): boolean {
  const pt = text.match(PORTUGUESE)
  return !pt || pt.length < 3
}

export interface Verdict {
  score: number
  heat: Heat
  signals: string[]
}

export function classify(text: string): Verdict {
  const seen = new Set<string>()
  let score = 0

  for (const rule of RULES) {
    if (rule.re.test(text)) {
      // Two rules can carry the same label (different wordings of one signal);
      // count the points once so a synonym can't double-score a comment.
      if (seen.has(rule.label)) continue
      score += rule.points
      seen.add(rule.label)
    }
  }
  const signals = [...seen]

  // Very short comments carry no usable intent, whatever they matched.
  if (text.length < 45) score -= 15

  score = Math.max(0, Math.min(100, score))
  const heat: Heat = score >= 60 ? 'hot' : score >= 38 ? 'warm' : 'cold'
  return { score, heat, signals }
}
