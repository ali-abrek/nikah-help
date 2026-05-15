import type { Metadata, Viewport } from 'next'
import { Rubik } from 'next/font/google'
import { ThemeProvider } from 'next-themes'
import './globals.css'
import { ReactQueryProvider } from '@/lib/react-query/provider'
import { AppShell } from '@/components/layout/AppShell'

const rubik = Rubik({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-rubik',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Nikah Help — Muslim Marriage Platform',
  description: 'Найдите свою вторую половину',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F5F3EE' },
    { media: '(prefers-color-scheme: dark)', color: '#0E1714' },
  ],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={`${rubik.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-full flex flex-col">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
          storageKey="nh_theme"
        >
          <ReactQueryProvider>
            <AppShell>{children}</AppShell>
          </ReactQueryProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
