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

/**
 * `core`  — само намерение. Без хотя бы одного такого сигнала комментарий
 *           не лид, чем бы он ни был приправлен.
 * `boost` — обстоятельства: срок, деньги, семья. Сами по себе ничего не
 *           значат — «а что будет в 2026 году?» это не заявка.
 * `minus` — штрафы.
 */
interface Rule {
  re: RegExp
  points: number
  label: string
  kind: 'core' | 'boost' | 'minus'
}

const RULES: Rule[] = [
  // ---- the strongest thing a stranger can do: ask to be contacted ----
  {
    re: /(can i (get|have) (your|the) (e-?mail|contact|number|whats ?app)|do you (offer|do|provide) (consultation|consulting|service|coaching)|how (can|do) i (contact|reach) you|dm me|email me|reach out to me|please contact me|send me (your|the) (e-?mail|contact|info))/i,
    points: 42,
    label: 'просит связаться',
    kind: 'core',
  },
  // ---- explicit forward-looking purchase ----
  {
    re: /\b(i|we|my (wife|husband|family))\b[^.!?]{0,70}\b(plan|planning|want|wanting|hope|hoping|intend|looking|going|about)\b[^.!?]{0,40}\b(to )?(buy|purchase|invest in|acquire)\b/i,
    points: 38,
    label: 'планирует покупку',
    kind: 'core',
  },
  {
    re: /\b(looking|searching|shopping|hunting|checking out|browsing|scouting) (for|at|around)?\b[^.!?]{0,40}\b(propert|apartment|apto|condo|house|home|land|lot|villa|beachfront|real estate|flat)/i,
    points: 30,
    label: 'ищет объект',
    kind: 'core',
  },
  // То же по-английски: цена и порядок покупки — это уже намерение.
  {
    re: /\b(how much (is|are|does|would|for)|what('s| is| are) the (price|cost)|price range|going rate)\b[^.!?]{0,50}\b(propert|apartment|apto|condo|house|home|land|villa|beachfront|real estate|flat|square met|sqm|m2)/i,
    points: 28,
    label: 'спрашивает цену объекта',
    kind: 'core',
  },
  {
    re: /\b(how (can|do|would) (i|we|a foreigner)|can (a )?foreigners?|is it possible (for a foreigner )?to)\b[^.!?]{0,45}\b(buy|purchase|own|acquire)\b/i,
    points: 32,
    label: 'спрашивает, как купить',
    kind: 'core',
  },
  // ---- explicit forward-looking relocation ----
  {
    re: /\b(i|we|my (wife|husband|family))\b[^.!?]{0,60}\b(am|are|'m|'re)?\s*(plan\w*|moving|relocat\w+|retiring|emigrat\w+)\b[^.!?]{0,40}\b(to|in)\b[^.!?]{0,25}(brazil|brasil|floripa|florian|salvador|bahia|natal|joao pessoa|recife|fortaleza|santa catarina|balneario)/i,
    points: 34,
    label: 'планирует переезд',
    kind: 'core',
  },
  {
    re: /\b(i|we)\b[^.!?]{0,40}\b(plan|planning|thinking about|considering|hoping|want|intend)\b[^.!?]{0,30}\b(to )?(move|relocate|retire|emigrate|come|live)\b/i,
    points: 24,
    label: 'думает о переезде',
    kind: 'core',
  },
  // ---- a real date makes a prospect actionable ----
  {
    re: /\b(next (year|month|spring|summer|fall|winter)|in \d{1,2} (months?|years?|weeks?)|by (the end of )?\d{4}|in (january|february|march|april|may|june|july|august|september|october|november|december)|this (fall|spring|summer|winter)|retire in \w+)\b/i,
    points: 22,
    label: 'назван срок',
    kind: 'boost',
  },
  // ---- money on the table ----
  {
    re: /(\$\s?\d[\d,.]*\s?(k|m|thousand|million)?|\bR\$\s?\d|\b\d{2,3}\s?k\s?(usd|dollars)|\bbudget\b|\bafford\b|\bsavings\b|\bpension\b|\bsocial security\b|\b401k\b)/i,
    points: 16,
    label: 'считает деньги',
    kind: 'boost',
  },
  // ---- asks the community something concrete ----
  {
    re: /\?/,
    points: 9,
    label: 'задаёт вопрос',
    kind: 'boost',
  },
  {
    re: /\b(which|what|where) (city|area|region|neighborhood|town|state|part)\b|\bwhere (should|would|do you) (i|we|you)\b|\brecommend\b/i,
    points: 14,
    label: 'выбирает место',
    kind: 'boost',
  },
  // ---- family raises the ticket and the seriousness ----
  {
    re: /\b(my (wife|husband|kids|children|son|daughter|family)|with my (wife|husband|family)|our (son|daughter|kids|children))\b/i,
    points: 8,
    label: 'переезжает с семьёй',
    kind: 'boost',
  },
  // ---- clearly a foreigner, which is our whole market ----
  {
    re: /\b(i'?m|i am|we'?re|we are)\s(an?\s)?(american|canadian|british|brit|dutch|german|australian|from (the )?(us|usa|uk|states|canada|netherlands|germany|australia)|based in (the )?(us|usa|uk))/i,
    points: 12,
    label: 'иностранец',
    kind: 'boost',
  },
  {
    re: /\b(i|we)('| ha)?ve (lived|been living) (in|near) (california|texas|florida|new york|arizona|colorado|nevada|oregon|washington|chicago|boston|america|the (us|usa|states|uk|netherlands|uk))/i,
    points: 12,
    label: 'иностранец',
    kind: 'boost',
  },
  // Retirement with a date is the single best predictor in this audience.
  {
    re: /\b(about to|going to|will|i|we)\s?(am|are)?\s?retir(e|ing)\b|\bwhen i retire\b|\bmy retirement\b/i,
    points: 18,
    label: 'скоро на пенсию',
    kind: 'core',
  },

  // ================= negative =================
  // Locals telling foreigners to stay away — the loudest group in the data.
  {
    // «go back» только с адресатом: местный гонит домой. Без этого правило
    // било по бразильцам, которые возвращаются — «go back to our beloved Brazil»
    // это лид, а не враждебность.
    re: /\b(don'?t come|do not come|stay away|go back (home|to (your|where))|you'?re not welcome|unwelcome|disgusting|gringo|colonizer|gentrif\w+|ruining|destroying (our|the)|it'?s a lie|fucked up|what happened to the american dream|don'?t advertise)\b|\blocals? (can'?t|cannot)\b|\bnow you come here\b/i,
    points: -55,
    label: 'враждебный комментарий',
    kind: 'minus',
  },
  // Sceptics arguing against the thesis — reads like intent to a keyword matcher.
  {
    re: /\b(i would never|wouldn'?t invest|bad (idea|investment|advice)|terrible (advice|idea)|can'?t understand why|makes no sense|scam|misleading|nonsense|overrated)\b/i,
    points: -40,
    label: 'спорит, не покупает',
    kind: 'minus',
  },
  // Already settled — a customer for nothing.
  {
    re: /\b(i (have )?lived here|i'?ve been (living |here )|i moved (here|to brazil) in \d{4}|been here (for )?\d+ (years?|months?)|i'?m brazilian|i am brazilian|sou brasileiro)\b/i,
    points: -22,
    label: 'уже живёт в Бразилии',
    kind: 'minus',
  },
  // Channel plugs and spam.
  {
    re: /(subscribe to|check out my|my channel|https?:\/\/|t\.me\/|wa\.me\/|@[a-z0-9_]+ (channel|travel))/i,
    points: -30,
    label: 'самореклама',
    kind: 'minus',
  },
  // Generic advice aimed at other viewers, not a personal plan.
  {
    re: /^(if you|for those who|anyone who|people should|you should|search for)\b/i,
    points: -18,
    label: 'совет другим, не о себе',
    kind: 'minus',
  },

  // ================= русский =================
  // Наши покупатели говорят не только по-английски: часть аудитории приходит
  // с русскоязычных каналов про Латинскую Америку. Метки те же, что у
  // английских правил, поэтому одно и то же намерение не считается дважды.
  {
    re: /(как (с вами )?связаться|можно ваш (контакт|телеф|номер|ватсап|whats)|напишите мне|скиньте контакт|дайте контакт|есть ли у вас консультаци|телефон для связи|как вас найти)/i,
    points: 42,
    label: 'просит связаться',
    kind: 'core',
  },
  {
    re: /\b(хочу|хотим|планиру|собира|думаю|решил|намерен)\w*\s+(\S+\s+){0,3}?(купить|приобрести|взять|инвестировать|вложить)/i,
    points: 38,
    label: 'планирует покупку',
    kind: 'core',
  },
  {
    re: /(ищу|ищем|подбира\w+|присматрива\w+)\s+(\S+\s+){0,3}?(квартир|дом|апартамент|жиль[её]|недвижимост|участок|виллу|студию)/i,
    points: 30,
    label: 'ищет объект',
    kind: 'core',
  },
  // Живая речь: «смотрю недвигу во флорипе», «интересует двушка у моря».
  {
    re: /(смотр(ю|им|ел|ели)|выбира\w+|подыскива\w+|рассматрива\w+|интересует|интересуюсь|мониторю|изучаю)\s+(\S+\s+){0,4}?(недвиг\w*|недвижимост\w*|квартир\w*|дом(а|ик)?\b|апартамент\w*|жиль[её]|участ\w+|студи\w+|двушк\w*|тр[её]шк\w*|таунхаус)/i,
    points: 30,
    label: 'ищет объект',
    kind: 'core',
  },
  {
    re: /(сколько стоит|поч[её]м|какие цены на|цены на|какая цена на|за сколько можно (купить|взять))\s*(\S+\s+){0,4}?(недвиг\w*|квартир\w*|дом\w*|апартамент\w*|жиль[её]|участ\w+|студи\w+|квадрат\w*)/i,
    points: 28,
    label: 'спрашивает цену объекта',
    kind: 'core',
  },
  {
    re: /(как (можно |там )?купить|можно ли (там )?купить|реально ли купить|как оформить покупку|как приобрести)\s*(\S+\s+){0,4}?(недвиг\w*|квартир\w*|дом\w*|жиль[её]|участ\w+|апартамент\w*)|(иностранц\w+ (может|можно|разрешено) (ли )?куп)/i,
    points: 32,
    label: 'спрашивает, как купить',
    kind: 'core',
  },
  {
    re: /\b(хочу|хотим|планиру|собира|готов\w*)\w*\s+(\S+\s+){0,3}?(переехать|перебраться|уехать|релокейт|переезд)/i,
    points: 34,
    label: 'планирует переезд',
    kind: 'core',
  },
  {
    re: /(думаю|подумыва\w+|рассматрива\w+|присматрива\w+)\s+(\S+\s+){0,3}?(переезд|переехать|о бразилии|вариант)/i,
    points: 24,
    label: 'думает о переезде',
    kind: 'core',
  },
  {
    re: /(в следующем (году|месяце)|через \d+ (месяц\w*|год\w*|недел\w*)|весной|летом|осенью|зимой|к (концу|началу) года|в \d{4} году)/i,
    points: 22,
    label: 'назван срок',
    kind: 'boost',
  },
  {
    re: /(сколько стоит|какая цена|цены на|по деньгам|бюджет|\d+\s?(тыс|тысяч|к)\s?(\$|долл|евро|рубл)|\$\s?\d|хватит ли)/i,
    points: 16,
    label: 'считает деньги',
    kind: 'boost',
  },
  {
    re: /(в каком (городе|районе)|куда лучше|где лучше|что посоветуете|какой (город|район) выбрать|подскажите куда)/i,
    points: 14,
    label: 'выбирает место',
    kind: 'boost',
  },
  {
    re: /(с (женой|мужем|семь[её]й|детьми|ребенком|ребёнком)|у меня (двое|трое|дети|ребен|ребён)|наши дети)/i,
    points: 8,
    label: 'переезжает с семьёй',
    kind: 'boost',
  },
  {
    re: /\b(на пенси|пенсионер|выхожу на пенсию|после выхода на пенсию)/i,
    points: 18,
    label: 'скоро на пенсию',
    kind: 'core',
  },
  // --- отрицательные ---
  {
    re: /(не советую|не стоит (туда|ехать|покупать)|обман|развод|кидалов|враньё|вранье|ерунда|бред|чушь|разводят|не ведитесь)/i,
    points: -40,
    label: 'спорит, не покупает',
    kind: 'minus',
  },
  {
    re: /(я (тут|здесь) (уже )?(живу|прожил)|живу (тут|здесь|в бразилии) (уже )?\d|переехал(а)? (сюда|в бразилию) в \d{4})/i,
    points: -22,
    label: 'уже живёт в Бразилии',
    kind: 'minus',
  },
  {
    re: /(подпис\w+ на (мой|наш) канал|мой канал|наш телеграм|пишите в личку.*канал)/i,
    points: -30,
    label: 'самореклама',
    kind: 'minus',
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

/** Русский комментарий переводить не нужно — его и так видно. */
export function isRussian(text: string): boolean {
  const cyr = text.match(/[Ѐ-ӿ]/g)
  return !!cyr && cyr.length >= text.replace(/\s/g, '').length * 0.3
}

export interface Verdict {
  score: number
  heat: Heat
  signals: string[]
}

/**
 * География. Мы продаём Бразилию, поэтому «сколько стоит жильё в Уругвае?»
 * и «цены на квартиры в Батуми» — не наши лиды, хотя намерение там настоящее.
 * Привязка ищется и в самом комментарии, и в названии ролика: под роликом
 * про Флорианополис «а сколько за двушку?» уже про Бразилию.
 */
const GEO =
  /(бразил|brazil|brasil|рио[\s-]?де|rio de|сан[\s-]?паулу|s[aã]o paulo|флорианопол|флорипа|florianop|floripa|балнеарио|balne[aá]rio|камбориу|camboriu|баи[яю]|bahia|салвадор|salvador|ресифи|recife|фортале|fortaleza|натал\b|natal\b|жоа[он]|joao pessoa|куритиба|curitiba|кампеше|campeche|журере|jurer[eê]|бузиос|b[uú]zios|транкозо|trancoso|санта[\s-]?катарин|santa catarina|минас|копакабан|ипанем|ipanema)/i

/**
 * О чём речь. Крупные травел-каналы обсуждают полмира, и без этой привязки
 * «а что будет в 2026 году?» под роликом про Францию набирало баллы наравне
 * с человеком, который спрашивает про квартиру во Флорианополисе.
 *
 * Оба языка держим вровень. Английская половина отставала: правило «планирует
 * переезд» ловило `I will be moving to Brazil in January`, а тема — нет, потому
 * что здесь были только русские «переезд» и «переехать». Живой лид с готовым
 * сроком уходил в ноль.
 */
const SUBJECT =
  /(гражданств|внж|citizenship|residency|визу|визы|виза\b|\bvisas?\b|переезд|переехать|эмиграц|иммиграц|релокац|relocat|emigrat|immigrat|\bmov(e|ing|ed)\b|\bexpat|\bsettl(e|ing)\b|недвиг|недвижимост|квартир|апартамент|жиль[ёе]|участ\w+|студи|двушк|тр[её]шк|propert|apartment|real estate|condo|beachfront|house|home|\bland\b|\bvilla\b|\bflat\b|аренд|снять|\brent(al|ing|s)?\b|купить|buy|purchase|инвест|invest|пенси|retir)/i

export function classify(text: string, context = ''): Verdict {
  const seen = new Set<string>()
  let core = 0
  let boost = 0
  let minus = 0

  for (const rule of RULES) {
    if (!rule.re.test(text)) continue
    // Одна метка может быть у двух правил (разные формулировки одного
    // сигнала) — засчитываем один раз, чтобы синоним не удваивал балл.
    if (seen.has(rule.label)) continue
    seen.add(rule.label)
    if (rule.kind === 'core') core += rule.points
    else if (rule.kind === 'boost') boost += rule.points
    else minus += rule.points
  }

  const signals = [...seen]

  // Нет намерения — нет лида, сколько бы обстоятельств вокруг ни было.
  if (core === 0) return { score: 0, heat: 'cold', signals: [] }

  // Намерение есть, но не про жильё и не про переезд.
  if (!SUBJECT.test(text)) return { score: 0, heat: 'cold', signals: [] }

  // И не про нашу страну — человек собрался в Батуми.
  if (!GEO.test(text) && !GEO.test(context)) return { score: 0, heat: 'cold', signals: [] }

  // Короткая реплика не несёт пригодного намерения, что бы она ни задела.
  const short = text.length < 45 ? -15 : 0

  const score = Math.max(0, Math.min(100, core + boost + minus + short))
  const heat: Heat = score >= 60 ? 'hot' : score >= 38 ? 'warm' : 'cold'
  return { score, heat, signals }
}
