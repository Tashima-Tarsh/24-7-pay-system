import type { Metadata } from 'next'
import { Toaster } from 'sonner'
import '@fontsource-variable/inter'
import './globals.css'

export const metadata: Metadata = {
  title: { default: 'Sanbookpay Merchant', template: '%s · Sanbookpay' },
  description: 'Manage your Sanbookpay merchant account.',
  robots: { index: false, follow: false },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en" className="dark">
    <body>
      <a className="skip-link" href="#main">Skip to content</a>
      {children}
      <Toaster theme="dark" richColors closeButton />
    </body>
  </html>
}
