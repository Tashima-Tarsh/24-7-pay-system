import { PageHeading } from '@/components/shared'

const sections = [
  ['quick-start', 'Quick start'],
  ['android-sdk', 'Android SDK'],
  ['api-reference', 'API reference'],
  ['security', 'Security'],
  ['faq', 'FAQ'],
]

function Code({ source, language }: { source: string; language: string }) {
  return <figure className="overflow-hidden rounded-lg border border-outline bg-[#151620]">
    <figcaption className="border-b border-outline px-4 py-2 text-xs font-semibold text-muted">{language}</figcaption>
    <pre tabIndex={0} className="overflow-auto px-4 py-3 font-mono text-xs leading-6 text-ink"><code>
      {source.split(/("[^"]*"|'[^']*'|\b(?:curl|true|false|implementation)\b)/).map((part, index) =>
        <span className={/^["']/.test(part) ? 'text-emerald-300' : /^(curl|true|false|implementation)$/.test(part) ? 'text-indigo-300' : undefined} key={index}>{part}</span>)}
    </code></pre>
  </figure>
}

export default function DocsPage() {
  return <article className="page">
    <PageHeading title="Integration docs" detail="Connect your game backend and Android app to the payment API." />
    <p className="alert">Intent-based payments require a merchant UPI ID.</p>
    <div className="grid items-start gap-6 lg:grid-cols-[180px_minmax(0,1fr)]">
      <nav aria-label="Documentation contents" className="flex flex-wrap gap-x-5 gap-y-2 border-b border-outline pb-4 lg:sticky lg:top-6 lg:grid lg:border-b-0">
        {sections.map(([id, title]) => <a key={id} href={`#${id}`} className="text-link text-sm">{title}</a>)}
      </nav>
      <div className="grid min-w-0 max-w-4xl gap-8">
        <section id="quick-start" className="section scroll-mt-36 lg:scroll-mt-4">
          <h2>Quick start</h2>
          <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed text-muted">
            <li>Add your merchant VPA in UPI routes and register your Android signing certificate SHA-256 in Security.</li>
            <li>Keep the merchant API key in your game server’s secrets manager.</li>
            <li>For each game order, have the game server request a short-lived payment session and give the session credential to the Android app.</li>
            <li>Let the SDK open the UPI app. Use your game server to verify and record the credit exactly once after bank confirmation.</li>
          </ol>
        </section>
        <section id="android-sdk" className="section scroll-mt-36 lg:scroll-mt-4">
          <h2>Android SDK</h2>
          <p className="description">Build the AAR from the Android SDK module, add it to your game’s libraries, and construct the SDK during the activity’s onCreate. When consuming a standalone AAR, add the Activity KTX, Lifecycle Runtime KTX and OkHttp dependencies listed in the SDK build file.</p>
          <Code language="Kotlin · build.gradle.kts" source={'dependencies {\n    implementation(files("libs/master-android-sdk-release.aar"))\n}'} />
          <Code language="Kotlin · game activity" source={'val sdk = SanbookPaySDK(this, "https://pay.example.com", callbacks)\n// Run when the player selects UPI.\nsdk.pay(PaymentSession(orderId, amountPaise, sessionToken))'} />
          <p className="description">Handle onPending by letting the player retry verification on the same order. On onVerified, forward the returned grant to your authenticated game backend for redemption before updating inventory.</p>
        </section>
        <section id="api-reference" className="section scroll-mt-36 lg:scroll-mt-4">
          <h2>API reference</h2>
          <div className="table-wrap" tabIndex={0} role="region" aria-label="Integration endpoints">
            <table className="table"><thead><tr><th scope="col">Endpoint</th><th scope="col">Purpose</th></tr></thead><tbody>
              <tr><td><code>GET /health</code></td><td>Check API availability.</td></tr>
              <tr><td><code>POST /api/payment-sessions</code></td><td>Use the merchant API key from the game server to issue a session for an order and signing certificate.</td></tr>
              <tr><td><code>GET /api/upi/next</code></td><td>Reserve an eligible route and exact paise amount for an order.</td></tr>
              <tr><td><code>POST /api/transactions/verify</code></td><td>Request verification after the bank confirms the payment.</td></tr>
              <tr><td><code>POST /api/transactions/redeem</code></td><td>Redeem the signed grant on the game server using the merchant API key.</td></tr>
              <tr><td><code>POST /api/webhook/bank</code></td><td>Receive authenticated provider events.</td></tr>
            </tbody></table>
          </div>
          <Code language="Shell · game server" source={'curl --fail-with-body "https://pay.example.com/api/payment-sessions" -H "x-api-key: $SANBOOKPAY_API_KEY" -H "Content-Type: application/json" --data \'{"orderId":"game-104","amountPaise":5000,"appSignature":"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"}\''} />
        </section>
        <section id="security" className="section scroll-mt-36 lg:scroll-mt-4">
          <h2>Security</h2>
          <p className="description">Keep merchant credentials and signing secrets on trusted servers. Use the original merchant order ID and the expected amount in integer paise. Store the unique verification or transaction reference alongside your game credit in a single atomic write.</p>
          <p className="description">Rotate the merchant key from Security when needed. Copy the replacement at issuance and update your server promptly.</p>
        </section>
        <section id="faq" className="section scroll-mt-36 lg:scroll-mt-4">
          <h2>FAQ</h2>
          <details className="panel"><summary className="cursor-pointer font-medium">Why does verification return 402?</summary><p className="description mt-2">A matching bank confirmation has not arrived. Leave the order pending and retry verification with bounded backoff.</p></details>
          <details className="panel"><summary className="cursor-pointer font-medium">What does a 503 route response mean?</summary><p className="description mt-2">No route is currently eligible. Honour the Retry-After value and review Route health before retrying.</p></details>
        </section>
      </div>
    </div>
  </article>
}
