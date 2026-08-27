'use client'

/**
 * Звук и всплывашка, когда радар нашёл кого-то нового.
 *
 * Звук синтезируется на месте, а не берётся файлом: так он не тянет за собой
 * загрузку, работает без сети и не упирается в запреты на внешние ресурсы.
 */

let ctx: AudioContext | null = null

/**
 * Браузеры не дают заводить звук без действия пользователя, поэтому контекст
 * создаётся по клику — на кнопке «Следить» или «Проверить звук».
 */
export function armSound(): void {
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (Ctor) ctx = new Ctor()
  }
  void ctx?.resume()
}

/** Две ноты вверх — короткое «ой, смотри». */
export function playChime(): void {
  if (!ctx || ctx.state !== 'running') return

  const now = ctx.currentTime
  const notes = [
    { freq: 784, at: 0, len: 0.13 }, // соль
    { freq: 1047, at: 0.11, len: 0.22 }, // до
  ]

  for (const n of notes) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'triangle'
    osc.frequency.value = n.freq

    // Мягкая атака и затухание — иначе на краях слышны щелчки.
    gain.gain.setValueAtTime(0, now + n.at)
    gain.gain.linearRampToValueAtTime(0.22, now + n.at + 0.015)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + n.at + n.len)

    osc.connect(gain).connect(ctx.destination)
    osc.start(now + n.at)
    osc.stop(now + n.at + n.len + 0.02)
  }
}

export async function askNotificationPermission(): Promise<boolean> {
  if (typeof Notification === 'undefined') return false
  if (Notification.permission === 'granted') return true
  if (Notification.permission === 'denied') return false
  try {
    return (await Notification.requestPermission()) === 'granted'
  } catch {
    return false
  }
}

export function showNotification(title: string, body: string): void {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
  try {
    new Notification(title, { body, tag: 'rossa-radar', icon: '/icon.svg' })
  } catch {
    // Некоторые браузеры требуют service worker — тогда просто молчим,
    // звук и заголовок вкладки всё равно сработают.
  }
}

/** Мигает заголовком вкладки, пока на страницу не вернутся. */
export function flashTitle(text: string): void {
  const original = document.title
  let on = false
  const timer = window.setInterval(() => {
    document.title = on ? original : text
    on = !on
  }, 900)

  const stop = () => {
    window.clearInterval(timer)
    document.title = original
    document.removeEventListener('visibilitychange', onVisible)
    window.removeEventListener('focus', stop)
  }
  const onVisible = () => {
    if (!document.hidden) stop()
  }

  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('focus', stop)
  window.setTimeout(stop, 60_000)
}
