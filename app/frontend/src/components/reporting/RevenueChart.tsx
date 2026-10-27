import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { RevenueSnapshot } from '../../../types/reporting'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function monthLabel(month: string): string {
  const idx = parseInt(month.slice(5, 7), 10) - 1
  return MONTHS[idx] ?? month
}

interface RevenueChartProps {
  data: RevenueSnapshot
  /** Fixed dimensions (tests / fixed layouts); omit to fill the container. */
  width?: number
  height?: number
}

export function RevenueChart({ data, width, height }: RevenueChartProps) {
  const money = (value: number, fractionDigits = 0) =>
    new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: data.currency,
      maximumFractionDigits: fractionDigits,
    }).format(value)

  const rows = data.series.map((p) => ({ ...p, label: monthLabel(p.month) }))

  const chart = (
    <BarChart
      data={rows}
      width={width}
      height={height}
      margin={{ top: 8, right: 8, bottom: 0, left: 8 }}
    >
      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border, #e5e7eb)" />
      <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
      <YAxis
        tickFormatter={(v: number) => money(v).replace(/[^\d.,kKmM]/g, '') || `${v}`}
        tickLine={false}
        axisLine={false}
        width={48}
        fontSize={11}
      />
      <Tooltip formatter={(v) => money(Number(v), 0)} labelFormatter={(l) => `Month: ${l}`} />
      <Bar dataKey="revenue" fill="var(--accent, #6366f1)" radius={[4, 4, 0, 0]} />
    </BarChart>
  )

  return (
    <div className="revenue-chart" data-testid="revenue-chart">
      <div className="revenue-chart__summary">
        <span className="revenue-chart__metric">
          {data.metric} · {data.year}
        </span>
        <span className="revenue-chart__ytd">YTD {money(data.ytd_total)}</span>
      </div>
      {width && height ? (
        chart
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          {chart}
        </ResponsiveContainer>
      )}
    </div>
  )
}
