'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { isRussian } from './classify'
import type { Prospect } from './types'

const KEY = 'rossa-radar:translations:v1'

/**
 * Russian translations of the comments, keyed by comment id.
 * Cached in the browser because a comment never changes — translating the same
 * text twice would just burn the model quota.
 */
export function useTranslations() {
  const [map, setMap] = useState<Record<string, string>>({})
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inFlight = useRef(new Set<string>())

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY)
      if (raw) setMap(JSON.parse(raw) as Record<string, string>)
    } catch {
      // blocked storage — translations just won't persist between visits
    }
  }, [])

  const translate = useCallback(async (prospects: Prospect[]) => {
    const todo = prospects.filter((p) => !isRussian(p.text) && !inFlight.current.has(p.id))
    if (todo.length === 0) return

    setMap((current) => {
      const missing = todo.filter((p) => !current[p.id])
      if (missing.length === 0) return current

      missing.forEach((p) => inFlight.current.add(p.id))
      setPending(true)
      setError(null)

      void (async () => {
        try {
          const res = await fetch('/api/translate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              items: missing.map((p) => ({ id: p.id, text: p.text })),
            }),
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
              // cache is a nicety, not a requirement
            }
            return next
          })
        } catch (e) {
          setError((e as Error).message)
          missing.forEach((p) => inFlight.current.delete(p.id))
        } finally {
          setPending(false)
        }
      })()

      return current
    })
  }, [])

  return { map, translate, pending, error }
}
