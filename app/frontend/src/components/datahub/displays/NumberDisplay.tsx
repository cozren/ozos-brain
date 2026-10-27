import type { DataPointValue } from '../../../types/datapoints'
import { formatNumber, numberOf } from '../../../lib/datapoints'

interface Props {
  value: DataPointValue
  unit: string
}

// The first cell of the first row, big; the second row (when present and
// numeric) is the previous value, shown as a delta.
export function NumberDisplay({ value, unit }: Props) {
  const { current, previous, delta } = numberOf(value)
  const up = delta !== null && delta >= 0
  return (
    <div className="dp-number">
      <div className="dp-number__row">
        <span className="dp-number__value">{formatNumber(current, '')}</span>
        {unit && <span className="dp-number__unit">{unit}</span>}
      </div>
      {delta !== null && (
        <span
          className={`dp-number__delta ${up ? 'dp-number__delta--up' : 'dp-number__delta--down'}`}
        >
          {up ? '▲' : '▼'} {up ? '+' : ''}
          {formatNumber(delta, '')} · from {formatNumber(previous, '')}
        </span>
      )}
    </div>
  )
}
