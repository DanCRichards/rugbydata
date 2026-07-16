import type { FreshnessEntry } from "@ruckmetrics/contracts";

interface Props {
  entries: FreshnessEntry[];
}

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Per-source data freshness: newest fetch time + row counts. */
export function Freshness({ entries }: Props) {
  return (
    <div className="freshness">
      <h3 className="panel__title">Data freshness</h3>
      {entries.length === 0 ? (
        <p className="muted">No freshness data reported.</p>
      ) : (
        <table className="freshness__table">
          <thead>
            <tr>
              <th>Source</th>
              <th>Scope</th>
              <th className="num">Rows</th>
              <th>Newest fetch</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e, i) => (
              <tr key={i}>
                <td>{e.source}</td>
                <td>{e.scope ?? "all"}</td>
                <td className="num">{e.rowCount.toLocaleString()}</td>
                <td>{fmtTime(e.newestFetchedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
