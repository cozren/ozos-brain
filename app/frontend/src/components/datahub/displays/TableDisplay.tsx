import type { DataPointValue } from '../../../types/datapoints'
import { TABLE_CAP, formatNumber, tableRows } from '../../../lib/datapoints'

interface Props {
  value: DataPointValue
}

// Every column, the first TABLE_CAP rows, a footer when the result was cut.
export function TableDisplay({ value }: Props) {
  const rows = tableRows(value)
  return (
    <div className="dp-table">
      <table>
        <thead>
          <tr>
            {value.columns.map((c, i) => (
              <th key={`${c}-${i}`} scope="col">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={r}>
              {row.map((cell, c) => (
                <td key={c} className={typeof cell === 'number' ? 'dp-table__num' : undefined}>
                  {formatNumber(cell, '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {value.rows.length > TABLE_CAP && (
        <p className="dp-table__footer">
          Showing {TABLE_CAP} of {value.rows.length} rows
        </p>
      )}
    </div>
  )
}
