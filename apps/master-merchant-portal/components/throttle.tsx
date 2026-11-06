'use client'

import { CartesianGrid, Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Empty, LoadState, PageHeading } from '@/components/shared'
import { Badge } from '@/components/ui/control'
import { localTime, rupees, useApi } from '@/lib/client'
import { scoreTone, upiId, type UpiRoute } from '@/lib/types'

type Throttle = {
  routes: UpiRoute[]
  bankVelocity: { bank: string; count: number }[]
  amountDistribution: { amountPaise: number; count: number }[]
  geoDistribution: { state: string; count: number }[]
  errors: { timestamp: string; upiId: string; reason: string }[]
}

function Distribution({ rows, label, color }: { rows: { name: string; count: number }[]; label: string; color: string }) {
  if (!rows.length) return <Empty>There is no recent activity to chart.</Empty>
  return <div className="panel h-60 min-w-0" role="img" aria-label={label}>
    <ResponsiveContainer width="100%" height="100%" minWidth={0}>
      <BarChart data={rows} margin={{ left: -8, right: 8 }}>
        <CartesianGrid stroke="#323445" vertical={false} />
        <XAxis dataKey="name" stroke="#b3b5c7" tick={{ fontSize: 11 }} />
        <YAxis allowDecimals={false} stroke="#b3b5c7" tick={{ fontSize: 11 }} />
        <Tooltip cursor={{ fill: '#242639' }} contentStyle={{ background: '#191a25', borderColor: '#323445', borderRadius: 6 }} />
        <Bar name="Assignments" dataKey="count" fill={color} isAnimationActive={false} radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  </div>
}

export function ThrottlePage() {
  const { data, error, refresh } = useApi<Throttle>('dashboard/throttle', 15_000)
  const eligible = data?.routes.filter((route) => route.isActive && !route.disabledUntil && route.healthScore >= 60 && route.usageCount < route.dailyLimit) ?? []
  const remaining = eligible.reduce((sum, route) => sum + Math.max(0, route.dailyLimit - route.usageCount), 0)
  const hourlyDemand = data?.bankVelocity.reduce((sum, bank) => sum + bank.count, 0) ?? 0
  const hoursRemaining = hourlyDemand >= 5 ? remaining / hourlyDemand : undefined
  const projection = !eligible.length ? 'No routes are currently eligible for new assignments.' :
    hoursRemaining === undefined ? 'At least five recent assignments are needed to estimate remaining capacity.' :
    hoursRemaining > 24 ? 'At the recent rate, current daily limits cover more than 24 hours of assignments.' :
    `At the recent rate, current daily limits cover about ${hoursRemaining < 1 ? `${Math.ceil(hoursRemaining * 60)} minutes` : `${Math.round(hoursRemaining * 10) / 10} hours`} of assignments.`

  return <article className="page">
    <PageHeading title="Route health" detail="Watch eligibility, assignment patterns and recent errors in the receiving pool." />
    {!data ? <LoadState error={error} retry={refresh} /> : <>
      {error && <LoadState error={error} retry={refresh} />}
      <section className="section">
        <div><h2>Receiving pool</h2><p className="description">Refreshes every 15 seconds. Routes below 60 are excluded from new assignments.</p></div>
        {data.routes.length ? <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
          {data.routes.map((route) => <div className="panel min-w-0" key={upiId(route)}>
            <Badge tone={route.isActive ? scoreTone(route.healthScore) : 'neutral'}>{route.isActive ? `${route.healthScore} / 100` : 'Disabled'}</Badge>
            <p className="mt-2 truncate text-sm" title={route.upiId}>{route.upiId}</p>
            {route.disabledUntil && <p className="description">Cooldown until {localTime(route.disabledUntil)}</p>}
          </div>)}
        </div> : <Empty>Add receiving routes to monitor their health.</Empty>}
        <p className="alert">{projection} Throttle limits and route cooldowns can reduce availability sooner.</p>
      </section>
      <div className="grid gap-6 xl:grid-cols-2">
        <section className="section"><h2>Velocity by bank</h2><Distribution label="Recent assignments by bank" color="#a5b4fc" rows={data.bankVelocity.map(({ bank, count }) => ({ name: bank, count }))} /></section>
        <section className="section"><h2>Amount distribution</h2><Distribution label="Recent assignments by amount" color="#818cf8" rows={data.amountDistribution.map(({ amountPaise, count }) => ({ name: rupees(amountPaise), count }))} /></section>
      </div>
      <section className="section"><h2>Geographic distribution</h2>
        {data.geoDistribution.length ? <div className="table-wrap" tabIndex={0} role="region" aria-label="Assignments by state">
          <table className="table"><thead><tr><th scope="col">State</th><th scope="col">Assignments</th></tr></thead>
            <tbody>{data.geoDistribution.map(({ state, count }) => <tr key={state}><td>{state}</td><td>{count}</td></tr>)}</tbody>
          </table>
        </div> : <Empty>No location data has been recorded.</Empty>}
      </section>
      <section className="section"><h2>Error timeline</h2>
        {data.errors.length ? <ol className="divide-y divide-outline rounded-lg border border-outline">
          {data.errors.map(({ timestamp, upiId: address, reason }, index) => <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-sm" key={`${timestamp}-${address}-${index}`}>
            <time dateTime={timestamp} className="text-muted">{localTime(timestamp)}</time><span>{address}</span>
            <Badge tone={/blocked|disable|limit|fraud/i.test(reason) ? 'bad' : 'warn'}>{reason}</Badge>
          </li>)}
        </ol> : <Empty>No recent routing errors.</Empty>}
      </section>
    </>}
  </article>
}
