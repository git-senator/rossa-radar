const PORTUGUESE =
  /\b(voc[eê]|obrigad[oa]|muito|gente|n[aã]o|aqui|ent[aã]o|tamb[eé]m|porque|sou|est[aá]|bom dia|boa noite|valeu|cara|mano|pra|pro)\b/gi

/**
 * Португальские комментарии отбрасываем до оценки: это местные, и громкая их
 * часть враждебна к иностранцам. Отсев дешёвый и снимает с модели половину
 * работы. Английский и русский остаются — покупатели приходят и с американских
 * каналов, и с русских про Латинскую Америку.
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
