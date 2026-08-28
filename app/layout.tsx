import type { Metadata } from 'next'
import { Cormorant_Infant, Figtree, Manrope } from 'next/font/google'
import './globals.css'

/** Заголовочный шрифт с сайта бренда. Кириллицу тянет. */
const cormorant = Cormorant_Infant({
  subsets: ['latin', 'cyrillic'],
  weight: ['300', '400', '600', '700'],
  variable: '--font-cormorant',
  display: 'swap',
})

/**
 * Figtree — текстовый шрифт бренда, но кириллицы в нём нет. Поэтому он идёт
 * первым в стопке, а русские буквы подхватывает Manrope: латиница остаётся
 * настоящей фирменной, кириллица — близкой по рисунку.
 */
const figtree = Figtree({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-figtree',
  display: 'swap',
})

const manrope = Manrope({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-manrope',
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
      <body className={`${cormorant.variable} ${figtree.variable} ${manrope.variable}`}>
        {children}
      </body>
    </html>
  )
}
