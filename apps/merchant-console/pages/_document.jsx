import { Html, Head, Main, NextScript } from 'next/document'

export default function Document() {
  return (
    <Html lang="en" className="dark">
      <Head />
      <body className="bg-slate-950 text-slate-100 min-h-screen flex flex-col">
        <Main />
        <NextScript />
      </body>
    </Html>
  )
}
