'use client'

import Link from 'next/link'
import { ArrowRight, BookOpen, KeyRound, Plus } from 'lucide-react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Empty, LoadState, PageHeading } from '@/components/shared'
import { Badge, buttonVariants } from '@/components/ui/control'
import { localTime, rupees, useApi } from '@/lib/client'
import type { Transaction } from '@/lib/types'

type Stats = {
  totalTxns: number
  revenueToday: number
  activeUpis: number
  successRate: number
  poolHealthScore: number
  revenue: { date: string; amountPaise: number }[]
}

const transactionAmount = (transaction: Transaction) => {
  const amount = transaction.amountPaise ?? transaction.amount
  return amount === undefined ? '—' : rupees(amount)
}

const statusTone = (status: string) => status === 'confirmed' ? 'good' : status === 'pending' ? 'warn' : status === 'failed' ? 'bad' : 'neutral'

export function Dashboard() {
  const stats = useApi<Stats>('dashboard/stats')
  const recent = useApi<{ transactions: Transaction[] }>('dashboard/recent-txns')
  const values = stats.data && [
    ['Total transactions', stats.data.totalTxns.toLocaleString('en-IN')],
    ['Revenue today', rupees(stats.data.revenueToday)],
    ['Active UPI routes', stats.data.activeUpis.toLocaleString('en-IN')],
    ['Success rate', `${stats.data.successRate.toFixed(1)}%`],
    ['Pool health', `${Math.round(stats.data.poolHealthScore)} / 100`],
  ]

  return <article className="page">
    <PageHeading title="Overview" detail="Track incoming payments and check the receiving routes your checkout can use.">
      <Link href="/upi-ids?add=1" className={buttonVariants()}><Plus size={16} /> Add UPI route</Link>
    </PageHeading>
    {!values ? <LoadState error={stats.error} retry={stats.refresh} /> : <>
      <dl className="grid grid-cols-2 gap-y-5 rounded-lg border border-outline bg-panel py-4 md:grid-cols-5">
        {values.map(([label, value], index) => <div key={label} className={`px-4 sm:px-5 ${index % 2 ? 'border-l border-outline' : ''} ${index > 0 ? 'md:border-l md:border-outline' : ''}`}>
          <dt className="text-xs font-medium text-muted">{label}</dt>
          <dd className="mt-1.5 text-2xl font-semibold tabular-nums tracking-tight">{value}</dd>
        </div>)}
      </dl>
      <section className="section" aria-labelledby="revenue-title">
        <div><h2 id="revenue-title">Confirmed revenue</h2><p className="description">Last 7 days · INR</p></div>
        {!stats.data?.revenue?.length ? <Empty>No confirmed revenue to chart yet.</Empty> : <div className="panel h-64 min-w-0" aria-label="Seven-day confirmed revenue chart" role="img">
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <LineChart data={stats.data.revenue} margin={{ top: 12, right: 16, bottom: 0, left: 8 }}>
              <CartesianGrid stroke="#323445" vertical={false} />
              <XAxis dataKey="date" stroke="#b3b5c7" tick={{ fontSize: 11 }} tickFormatter={(date: string) => date.slice(5)} />
              <YAxis stroke="#b3b5c7" tick={{ fontSize: 11 }} tickFormatter={rupees} width={76} />
              <Tooltip contentStyle={{ background: '#191a25', borderColor: '#323445', borderRadius: 6 }} formatter={(value: number) => [rupees(value), 'Confirmed']} />
              <Line type="monotone" dataKey="amountPaise" stroke="#a5b4fc" strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>}
      </section>
    </>}
    <section className="section" aria-labelledby="transactions-title">
      <h2 id="transactions-title">Recent transactions</h2>
      {!recent.data ? <LoadState error={recent.error} retry={recent.refresh} /> :
        !recent.data.transactions.length ? <Empty>New transactions will appear here after your first checkout.</Empty> :
          <div className="table-wrap" tabIndex={0} role="region" aria-label="Recent transactions">
            <table className="table"><thead><tr>{['Order', 'Amount', 'Receiving route', 'Status', 'Created'].map((heading) => <th key={heading} scope="col">{heading}</th>)}</tr></thead>
              <tbody>{recent.data.transactions.map((txn) => <tr key={txn.id || txn._id || txn.orderId}>
                <td className="font-medium">{txn.orderId}</td><td className="whitespace-nowrap">{transactionAmount(txn)}</td>
                <td>{txn.upiIdUsed}</td><td><Badge tone={statusTone(txn.status)}><span className="capitalize">{txn.status}</span></Badge></td>
                <td className="whitespace-nowrap text-muted">{localTime(txn.createdAt)}</td>
              </tr>)}</tbody>
            </table>
          </div>}
    </section>
    <div className="flex flex-wrap gap-x-7 gap-y-3 border-t border-outline pt-4 text-sm">
      <Link className="text-link inline-flex items-center gap-2" href="/security"><KeyRound size={15} /> API key settings <ArrowRight size={14} /></Link>
      <Link className="text-link inline-flex items-center gap-2" href="/docs"><BookOpen size={15} /> Integration guide <ArrowRight size={14} /></Link>
    </div>
  </article>
}
