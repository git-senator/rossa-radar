'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { isRussian } from './language'
import type { Prospect } from './types'

const KEY = 'rossa-radar:translations:v1'

/**
 * Русские переводы комментариев, по id комментария.
 *
 * Кешируются в браузере: комментарий не меняется, и переводить один и тот же
 * текст дважды значило бы жечь квоту модели впустую.
 */
export function useTranslations() {
  const [map, setMap] = useState<Record<string, string>>({})
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /** Что уже перевели или отправили в перевод — чтобы не слать повторно. */
  const handled = useRef<Set<string>>(new Set())
  const loaded = useRef(false)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY)
      if (raw) {
        const saved = JSON.parse(raw) as Record<string, string>
        setMap(saved)
        Object.keys(saved).forEach((id) => handled.current.add(id))
      }
    } catch {
      // хранилище закрыто — переводы просто не переживут перезагрузку
    }
    loaded.current = true
  }, [])

  const translate = useCallback(async (prospects: Prospect[]) => {
    // Русские не переводим, уже обработанные не трогаем.
    const todo = prospects.filter((p) => !isRussian(p.text) && !handled.current.has(p.id))
    if (todo.length === 0) return

    todo.forEach((p) => handled.current.add(p.id))
    setPending(true)
    setError(null)

    try {
      const res = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: todo.map((p) => ({ id: p.id, text: p.text })) }),
      })
      const data = (await res.json()) as {
        translations?: Record<string, string>
        error?: string
      }
      if (!res.ok || data.error) throw new Error(data.error ?? `Ошибка ${res.status}`)

      setMap((prev) => {
        const next = { ...prev, ...(data.translations ?? {}) }
        try {
          localStorage.setItem(KEY, JSON.stringify(next))
        } catch {
          // кеш — удобство, а не требование
        }
        return next
      })
    } catch (e) {
      setError((e as Error).message)
      // Вернуть в очередь: следующий скан попробует ещё раз.
      todo.forEach((p) => handled.current.delete(p.id))
    } finally {
      setPending(false)
    }
  }, [])

  return { map, translate, pending, error }
}
