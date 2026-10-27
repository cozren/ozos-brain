import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { DataPointValue } from '../../../types/datapoints'
import { lineSeries } from '../../../lib/datapoints'

interface Props {
  value: DataPointValue
  // Fixed size (tests, previews); otherwise the chart fills its tile.
  width?: number
  height?: number
}

const CYAN = '#00FFFF'
const DIM = 'rgba(148,163,184,0.7)'

// First column on x, second on y.
export function LineDisplay({ value, width, height }: Props) {
  if (value.columns.length < 2) {
    return <p className="dp-line__hint">Need two columns (x, y)</p>
  }
  const data = lineSeries(value)
  const chart = (
    <LineChart data={data} margin={{ top: 12, right: 16, bottom: 4, left: 0 }}>
      <CartesianGrid stroke="rgba(148,163,184,0.12)" vertical={false} />
      <XAxis dataKey="x" tickLine={false} axisLine={false} fontSize={10} stroke={DIM} />
      <YAxis tickLine={false} axisLine={false} fontSize={10} stroke={DIM} width={44} />
      <Tooltip
        contentStyle={{
          background: 'rgba(8,12,20,0.95)',
          border: '1px solid rgba(0,255,255,0.25)',
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
        }}
        labelStyle={{ color: DIM }}
        itemStyle={{ color: CYAN }}
      />
      <Line
        type="monotone"
        dataKey="y"
        name={value.columns[1]}
        stroke={CYAN}
        strokeWidth={2}
        dot={{ r: 2.5, fill: CYAN, stroke: CYAN }}
        activeDot={{ r: 4 }}
        isAnimationActive={false}
      />
    </LineChart>
  )
  if (width && height) {
    return (
      <div className="dp-line" style={{ width, height }}>
        <LineChart
          width={width}
          height={height}
          data={data}
          margin={{ top: 12, right: 16, bottom: 4, left: 0 }}
        >
          {chart.props.children}
        </LineChart>
      </div>
    )
  }
  return (
    <div className="dp-line">
      <ResponsiveContainer width="100%" height="100%">
        {chart}
      </ResponsiveContainer>
    </div>
  )
}
