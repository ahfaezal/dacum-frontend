import React, { useEffect, useState } from "react";

const API_BASE =
  (import.meta?.env?.VITE_API_BASE && String(import.meta.env.VITE_API_BASE)) ||
  "https://dacum-backend.onrender.com";

function getQueryParam(name) {
  // 1) normal query: ?session=...
  const s = new URLSearchParams(window.location.search);
  const v1 = s.get(name);
  if (v1) return v1;

  // 2) hash query: #/cp-editor?session=...&cu=...
  const h = window.location.hash || "";
  const qIndex = h.indexOf("?");
  if (qIndex === -1) return "";
  const qs = h.slice(qIndex + 1);
  const hParams = new URLSearchParams(qs);
  return hParams.get(name) || "";
}

function deepClone(obj) {
  try {
    // eslint-disable-next-line no-undef
    if (typeof structuredClone === "function") return structuredClone(obj);
  } catch (_) {}
  return JSON.parse(JSON.stringify(obj ?? null));
}

export default function CpEditor() {
  const sessionId = String(getQueryParam("session") || "").trim();
  const cuId = String(getQueryParam("cu") || "").trim().toLowerCase(); // 🔒 LOCKED
  const fromDraft = String(getQueryParam("fromDraft") || "") === "1";

  const [cp, setCp] = useState(null);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [validating, setValidating] = useState(false);
  const [locking, setLocking] = useState(false);
  const [seeding, setSeeding] = useState(false);

  function buildCpFromDraft(draft) {
    const cuTitle =
      String(draft?.cuTitle || draft?.cu?.cuTitle || "").trim() || "(tiada tajuk CU)";

    // draft mungkin simpan waList sebagai array string, atau workActivities penuh
    const waList = Array.isArray(draft?.waList) ? draft.waList : [];
    const workActivities =
      Array.isArray(draft?.workActivities) && draft.workActivities.length
        ? draft.workActivities
        : waList.map((title, idx) => ({
            // waId boleh kosong (UI anda dah ada fallback waIdx)
            waId: "",
            waTitle: String(title || "").trim() || `(WA#${idx + 1})`,
            workSteps: [],
          }));

    return {
      // asas
      sessionId,
      status: draft?.status || "draft",
      cu: {
        cuCode: cuId,
        cuTitle,
      },
      workActivities,
      // validation optional
      validation: draft?.validation || null,
      // simpan apa-apa data lain kalau ada
      ...draft,
    };
  }

  function tryLoadDraftFromSessionStorage() {
    if (!sessionId || !cuId) return false;

    const key = `cpDraft:${sessionId}:${cuId}`;
    const raw = sessionStorage.getItem(key);
    if (!raw) return false;

    try {
      const draft = JSON.parse(raw);

      // jika draft ini memang untuk session/cu yang betul
      const dSession = String(draft?.sessionId || "").trim();
      const dCu = String(draft?.cuCode || draft?.cuId || draft?.cu?.cuCode || "").trim().toLowerCase();

      if (dSession && dSession !== sessionId) return false;
      if (dCu && dCu !== cuId) return false;

      setErr("");
      setCp(buildCpFromDraft(draft));
      return true;
    } catch (e) {
      console.error("Gagal parse draft dari sessionStorage:", e);
      return false;
    }
  }

  async function loadCp() {
    if (!sessionId || !cuId) {
      setErr("sessionId atau cu tidak sah.");
      setCp(null);
      return;
    }

    setErr("");
    try {
      const r = await fetch(
        `${API_BASE}/api/cp/${encodeURIComponent(sessionId)}/${encodeURIComponent(
          cuId
        )}?version=latest`
      );
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || "CP belum wujud. Jana draft dahulu.");
      setCp(j);
    } catch (e) {
      setCp(null);
      setErr(String(e?.message || e));
    }
  }

async function aiSeedWs() {
  if (!cp) return;

  setSeeding(true);
  setErr("");
  try {
    const waList = (cp.workActivities || []).map((x) => String(x.waTitle || "").trim()).filter(Boolean);
    const cuTitle = String(cp.cu?.cuTitle || "").trim();

    const r = await fetch(`${API_BASE}/api/cp/ai/seed-ws`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId,
        cuCode: cuId,
        cuTitle,
        waList,
        wsPerWa: 5, // boleh ubah 3–7
      }),
    });

    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j?.error || "Gagal AI seed WS");

    // merge workActivities hasil AI ke CP
    setCp((prev) => ({
      ...(prev || {}),
      workActivities: j.workActivities || prev?.workActivities || [],
    }));
  } catch (e) {
    setErr(String(e?.message || e));
  } finally {
    setSeeding(false);
  }
}
  
  async function saveCp() {
    if (!cp) return;

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
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || "Gagal simpan CP");

      if (j?.validation) setCp((prev) => ({ ...(prev || {}), validation: j.validation }));
    } catch (e) {
      setErr(String(e?.message || e));
    } finally {
      setSaving(false);
    }
  }

  async function validateNow() {
    if (!cp) return;

    setValidating(true);
    setErr("");
    try {
      const r = await fetch(`${API_BASE}/api/cp/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, cuCode: cuId, cuId, cp }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || "Gagal validate");
      setCp((prev) => ({ ...(prev || {}), validation: j }));
    } catch (e) {
      setErr(String(e?.message || e));
    } finally {
      setValidating(false);
    }
  }

  async function lockCp() {
    if (!cp) return;

    setLocking(true);
    setErr("");
    try {
      const r = await fetch(`${API_BASE}/api/cp/lock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, cuCode: cuId, cuId, lockedBy: "PANEL" }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || "Gagal lock");

      await loadCp();
      alert(`LOCKED ✅  ${j.cpId || ""} (${j.version || ""})`);
    } catch (e) {
      setErr(String(e?.message || e));
    } finally {
      setLocking(false);
    }
  }

  function updateWs(waIndex, wsIndex, newText) {
    setCp((prev) => {
      if (!prev) return prev;
      const next = deepClone(prev);

      next.workActivities = next.workActivities || [];
      next.workActivities[waIndex] = next.workActivities[waIndex] || {};
      next.workActivities[waIndex].workSteps = next.workActivities[waIndex].workSteps || [];
      next.workActivities[waIndex].workSteps[wsIndex] =
        next.workActivities[waIndex].workSteps[wsIndex] || {};

      next.workActivities[waIndex].workSteps[wsIndex].wsText = newText;
      return next;
    });
  }

  function updatePcField(waIndex, wsIndex, field, value) {
    setCp((prev) => {
      if (!prev) return prev;
      const next = deepClone(prev);

      next.workActivities = next.workActivities || [];
      next.workActivities[waIndex] = next.workActivities[waIndex] || {};
      next.workActivities[waIndex].workSteps = next.workActivities[waIndex].workSteps || [];
      next.workActivities[waIndex].workSteps[wsIndex] =
        next.workActivities[waIndex].workSteps[wsIndex] || {};

      next.workActivities[waIndex].workSteps[wsIndex].pc =
        next.workActivities[waIndex].workSteps[wsIndex].pc || {};

      next.workActivities[waIndex].workSteps[wsIndex].pc[field] = value;
      return next;
    });
  }

  useEffect(() => {
    if (!sessionId || !cuId) return;

    // ✅ PRIORITY: jika datang dari Generate Draft, load dari sessionStorage dulu
    if (fromDraft) {
      const ok = tryLoadDraftFromSessionStorage();
      if (ok) return; // stop, tak perlu fetch API
      // kalau draft tak jumpa, baru fallback ke API
    }

    loadCp();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, cuId, fromDraft]);

  const issues = cp?.validation?.issues || [];

  return (
    <div style={{ padding: 16, fontFamily: "Arial, sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h2 style={{ margin: 0 }}>CP Editor</h2>
          <div style={{ marginTop: 6 }}>
            <b>Session:</b> {sessionId || <i>(tiada)</i>} &nbsp; | &nbsp; <b>CU:</b>{" "}
            {cuId || <i>(tiada)</i>}
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            onClick={() => {
              window.location.href = `/#/cp?session=${encodeURIComponent(sessionId)}`;
            }}
          >
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
            href={`${API_BASE}/api/cp/export/${encodeURIComponent(sessionId)}/${encodeURIComponent(
              cuId
            )}?format=json`}
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
            <div style={{ fontWeight: "bold" }}>{cp.cu?.cuTitle || "(tiada tajuk CU)"}</div>
            <div style={{ fontSize: 13, opacity: 0.85 }}>{cp.cu?.cuCode || cuId}</div>

            <div style={{ marginTop: 8, fontSize: 13 }}>
              <b>Status:</b> {cp.status || "draft"} &nbsp; | &nbsp;{" "}
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
                style={{
                  border: "1px solid #ddd",
                  borderRadius: 8,
                  padding: 12,
                  marginBottom: 12,
                }}
              >
                <div style={{ fontWeight: "bold", marginBottom: 8 }}>
                  {wa.waId || `WA${waIdx + 1}`}: {wa.waTitle || "(tiada tajuk WA)"}
                </div>

                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        <th
                          style={{
                            textAlign: "left",
                            borderBottom: "1px solid #ccc",
                            padding: 8,
                            width: "18%",
                          }}
                        >
                          WS No
                        </th>
                        <th style={{ textAlign: "left", borderBottom: "1px solid #ccc", padding: 8 }}>
                          Work Step (WS)
                        </th>
                        <th
                          style={{
                            textAlign: "left",
                            borderBottom: "1px solid #ccc",
                            padding: 8,
                            width: "35%",
                          }}
                        >
                          Performance Criteria (VOC)
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {(wa.workSteps || []).map((ws, wsIdx) => (
                        <tr key={ws.wsId || wsIdx}>
                          <td style={{ borderBottom: "1px solid #eee", padding: 8 }}>
                            {ws.wsNo || `${waIdx + 1}.${wsIdx + 1}`}
                          </td>

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

                      {!wa.workSteps?.length && (
                        <tr>
                          <td colSpan={3} style={{ padding: 10, opacity: 0.75 }}>
                            (Tiada Work Steps untuk WA ini.)
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}

            {!cp.workActivities?.length && (
              <div style={{ marginTop: 10, opacity: 0.75 }}>
                (Tiada Work Activities dalam CP ini.)
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
