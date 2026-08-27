'use client'

import { useCallback, useEffect, useState } from 'react'

export type Status = 'new' | 'working' | 'replied' | 'rejected'

export const STATUSES: { id: Exclude<Status, 'new'>; label: string }[] = [
  { id: 'working', label: 'В работе' },
  { id: 'replied', label: 'Ответили' },
  { id: 'rejected', label: 'Не наш' },
]

const KEY = 'rossa-radar:status:v1'

/**
 * Per-comment status, kept in this browser.
 * Deliberately local: the radar has one operator, and a shared database would
 * mean provisioning and secrets for a list that fits in a few kilobytes.
 */
export function useStatuses() {
  const [map, setMap] = useState<Record<string, Status>>({})
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY)
      if (raw) setMap(JSON.parse(raw) as Record<string, Status>)
    } catch {
      // private mode or blocked storage — the app still works, just forgets
    }
    setLoaded(true)
  }, [])

  const set = useCallback((id: string, status: Status) => {
    setMap((prev) => {
      const next = { ...prev }
      if (status === 'new') delete next[id]
      else next[id] = status
      try {
        localStorage.setItem(KEY, JSON.stringify(next))
      } catch {
        // ignore — nothing we can do, and losing a label is not worth an error
      }
      return next
    })
  }, [])

  return { map, set, loaded }
}
