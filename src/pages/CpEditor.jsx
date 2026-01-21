import React, { useEffect, useState } from "react";

const API_BASE =
  (import.meta?.env?.VITE_API_BASE && String(import.meta.env.VITE_API_BASE)) ||
  "https://dacum-backend.onrender.com";

function getQueryParam(name) {
  // 1) normal query: ?session=...
  const s = new URLSearchParams(window.location.search);
  const v1 = s.get(name);
  if (v1) return v1;

  // 2) hash query: #/cp?session=...
  const h = window.location.hash || "";
  const qIndex = h.indexOf("?");
  if (qIndex === -1) return "";
  const qs = h.slice(qIndex + 1);
  const hParams = new URLSearchParams(qs);
  return hParams.get(name) || "";
}

export default function CpEditor() {
  const params = new URLSearchParams(window.location.search);
  const sessionId = getQueryParam("session");
  const cuId = getQueryParam("cu");

  const [cp, setCp] = useState(null);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [validating, setValidating] = useState(false);
  const [locking, setLocking] = useState(false);

  async function loadCp() {
    setErr("");
    try {
      const r = await fetch(
        `${API_BASE}/api/cp/${encodeURIComponent(sessionId)}/${encodeURIComponent(cuId)}?version=latest`
      );
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "Gagal load CP");
      setCp(j);
    } catch (e) {
      setErr(String(e));
    }
  }

  async function saveCp() {
    setSaving(true);
    setErr("");
    try {
      const r = await fetch(
        `${API_BASE}/api/cp/${encodeURIComponent(sessionId)}/${encodeURIComponent(cuId)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(cp),
        }
      );
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "Gagal simpan CP");
      // refresh validation info
      setCp((prev) => ({ ...prev, validation: j.validation }));
    } catch (e) {
      setErr(String(e));
    } finally {
      setSaving(false);
    }
  }

  async function validateNow() {
    setValidating(true);
    setErr("");
    try {
      const r = await fetch(`${API_BASE}/api/cp/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, cuId, cp }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "Gagal validate");
      setCp((prev) => ({ ...prev, validation: j }));
    } catch (e) {
      setErr(String(e));
    } finally {
      setValidating(false);
    }
  }

  async function lockCp() {
    setLocking(true);
    setErr("");
    try {
      const r = await fetch(`${API_BASE}/api/cp/lock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, cuId, lockedBy: "PANEL" }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "Gagal lock");
      await loadCp();
      alert(`LOCKED ✅  ${j.cpId} (${j.version})`);
    } catch (e) {
      setErr(String(e));
    } finally {
      setLocking(false);
    }
  }

  function updateWs(waIndex, wsIndex, newText) {
    setCp((prev) => {
      const next = structuredClone(prev);
      next.workActivities[waIndex].workSteps[wsIndex].wsText = newText;
      return next;
    });
  }

  function updatePcField(waIndex, wsIndex, field, value) {
    setCp((prev) => {
      const next = structuredClone(prev);
      next.workActivities[waIndex].workSteps[wsIndex].pc[field] = value;
      return next;
    });
  }

  useEffect(() => {
    if (sessionId && cuId) loadCp();
  }, [sessionId, cuId]);

  const issues = cp?.validation?.issues || [];

  return (
    <div style={{ padding: 16, fontFamily: "Arial, sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h2 style={{ margin: 0 }}>CP Editor</h2>
          <div style={{ marginTop: 6 }}>
            <b>Session:</b> {sessionId} &nbsp; | &nbsp; <b>CU:</b> {cuId}
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button onClick={() => (window.location.href = `/?page=cp&session=${encodeURIComponent(sessionId)}`)}>
            Back
          </button>
          <button disabled={validating || !cp} onClick={validateNow}>
            {validating ? "Validating..." : "Validate"}
          </button>
          <button disabled={saving || !cp} onClick={saveCp}>
            {saving ? "Saving..." : "Save"}
          </button>
          <button disabled={locking || !cp} onClick={lockCp}>
            {locking ? "Locking..." : "Lock"}
          </button>
          <a
            href={`${API_BASE}/api/cp/export/${encodeURIComponent(sessionId)}/${encodeURIComponent(cuId)}?format=json`}
            target="_blank"
            rel="noreferrer"
          >
            Export JSON
          </a>
        </div>
      </div>

      {err && <div style={{ color: "crimson", marginTop: 8 }}>{err}</div>}
      {!cp && <div style={{ marginTop: 12 }}>Loading CP...</div>}

      {cp && (
        <div style={{ marginTop: 12 }}>
          <div style={{ padding: 10, border: "1px solid #ddd", borderRadius: 8 }}>
            <div style={{ fontWeight: "bold" }}>{cp.cu?.cuTitle}</div>
            <div style={{ fontSize: 13, opacity: 0.85 }}>{cp.cu?.cuCode}</div>
            <div style={{ marginTop: 8, fontSize: 13 }}>
              <b>Status:</b> {cp.status} &nbsp; | &nbsp;{" "}
              <b>MinRules:</b> {String(cp.validation?.minRulesPassed)} &nbsp; | &nbsp;
              <b>VOC:</b> {String(cp.validation?.vocPassed)} &nbsp; | &nbsp;
              <b>Completeness:</b> {String(cp.validation?.completenessPassed)}
            </div>

            {issues.length > 0 && (
              <div style={{ marginTop: 10 }}>
                <b>Issues:</b>
                <ul>
                  {issues.map((x, i) => (
                    <li key={i} style={{ color: x.level === "ERROR" ? "crimson" : "#a66f00" }}>
                      [{x.level}] {x.code}: {x.msg}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div style={{ marginTop: 12 }}>
            {(cp.workActivities || []).map((wa, waIdx) => (
              <div
                key={wa.waId || waIdx}
                style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12, marginBottom: 12 }}
              >
                <div style={{ fontWeight: "bold", marginBottom: 8 }}>
                  {wa.waId}: {wa.waTitle}
                </div>

                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: "left", borderBottom: "1px solid #ccc", padding: 8, width: "18%" }}>
                          WS No
                        </th>
                        <th style={{ textAlign: "left", borderBottom: "1px solid #ccc", padding: 8 }}>
                          Work Step (WS)
                        </th>
                        <th style={{ textAlign: "left", borderBottom: "1px solid #ccc", padding: 8, width: "35%" }}>
                          Performance Criteria (VOC)
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {(wa.workSteps || []).map((ws, wsIdx) => (
                        <tr key={ws.wsId || wsIdx}>
                          <td style={{ borderBottom: "1px solid #eee", padding: 8 }}>{ws.wsNo}</td>

                          <td style={{ borderBottom: "1px solid #eee", padding: 8 }}>
                            <textarea
                              value={ws.wsText || ""}
                              onChange={(e) => updateWs(waIdx, wsIdx, e.target.value)}
                              style={{ width: "100%", minHeight: 56 }}
                            />
                          </td>

                          <td style={{ borderBottom: "1px solid #eee", padding: 8 }}>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 6 }}>
                              <input
                                placeholder="Verb"
                                value={ws.pc?.verb || ""}
                                onChange={(e) => updatePcField(waIdx, wsIdx, "verb", e.target.value)}
                              />
                              <input
                                placeholder="Object"
                                value={ws.pc?.object || ""}
                                onChange={(e) => updatePcField(waIdx, wsIdx, "object", e.target.value)}
                              />
                              <input
                                placeholder="Qualifier"
                                value={ws.pc?.qualifier || ""}
                                onChange={(e) => updatePcField(waIdx, wsIdx, "qualifier", e.target.value)}
                              />
                              <textarea
                                placeholder="pcText"
                                value={ws.pc?.pcText || ""}
                                onChange={(e) => updatePcField(waIdx, wsIdx, "pcText", e.target.value)}
                                style={{ width: "100%", minHeight: 56 }}
                              />
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
