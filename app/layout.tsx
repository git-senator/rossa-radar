import type { Metadata } from 'next'
import { Literata, Commissioner, IBM_Plex_Mono } from 'next/font/google'
import './globals.css'

const literata = Literata({
  subsets: ['latin', 'cyrillic'],
  weight: ['600', '700'],
  variable: '--font-literata',
  display: 'swap',
})

const commissioner = Commissioner({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-commissioner',
  display: 'swap',
})

const plexMono = IBM_Plex_Mono({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '500'],
  variable: '--font-plex-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Радар Rossa',
  description:
    'Находит людей, которые прямо сейчас собираются переехать в Бразилию или купить там жильё.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body className={`${literata.variable} ${commissioner.variable} ${plexMono.variable}`}>
        {children}
      </body>
    </html>
  )
}
