"use client";
import Repos from "./Repos";
import Suites from "./Suites";
import Envs from "./Envs";
import Automation from "./Automation";
import { Runs } from "./Runs";

const TABS = [["repos", "Repos"], ["suites", "Suites"], ["envs", "Environments"], ["auto", "Automation"], ["history", "Run history"]];
export default function Manage({ tab, setTab, onClose, ...ctx }) {
  const go = (p) => { const [pg, id] = p.split("/"); if (pg === "run") { onClose(); ctx.openRun(+id); } else if (pg === "runs") onClose(); };
  const props = { ...ctx, env: ctx.envId, go };
  return (
    <div className="scrim" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="mhead"><h2>Manage</h2><div className="tabs">{TABS.map(([k, l]) => <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>)}</div><button className="btn sm" onClick={onClose}>Done</button></div>
        <div className="mbody"><div className="page">
          {tab === "repos" && <Repos {...props} />}{tab === "suites" && <Suites {...props} />}{tab === "envs" && <Envs {...props} />}{tab === "auto" && <Automation {...props} />}{tab === "history" && <Runs {...props} />}
        </div></div>
      </div>
    </div>
  );
}
