"use client";
import { layerName } from "./ui";
export default function Flaky({ stats }) {
  const list = stats?.flaky || [];
  return (
    <>
      <div className="head"><div><h1>Flaky tests</h1><p>A test is flagged when its result flips between pass and fail at least 3 times in its last 10 runs, or when it only passes after a retry. Same rule as Allure TestOps. Flaky tests cost trust: people stop believing red builds.</p></div></div>
      {!list.length ? <div className="card empty">No flaky tests detected. Tests need at least 3 runs of history before they can be judged.</div> : (
        <div className="card scroll"><table className="tbl">
          <thead><tr><th>Test</th><th>Last 10 runs (old → new)</th><th>Flips</th><th>Stability</th></tr></thead>
          <tbody>{list.map((f) => (
            <tr key={f.key}>
              <td>{f.name}<div className="small muted">{f.suite} · {layerName(f.layer)}{f.retryPasses ? ` · passed only after retry ${f.retryPasses}×` : ""}</div>{f.lastError && <div className="small bad" style={{ marginTop: 3 }}>{f.lastError.split("\n")[0].slice(0, 140)}</div>}</td>
              <td><span className="dots">{f.history.map((h, i) => <i key={i} className={h === "f" ? "f" : ""} title={h === "f" ? "failed" : "passed"} />)}</span></td>
              <td>{f.flips}</td><td className={f.stability < 70 ? "bad" : "amber"}>{f.stability}%</td>
            </tr>))}</tbody>
        </table></div>)}
    </>
  );
}
