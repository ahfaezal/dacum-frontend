import React, { useEffect, useMemo, useState } from "react";

const API_BASE =
  (import.meta?.env?.VITE_API_BASE && String(import.meta.env.VITE_API_BASE)) ||
  "https://dacum-backend.onrender.com";

function getQueryParams() {
  const h = window.location.hash || "";
  const q = h.includes("?") ? h.split("?")[1] : "";
  return new URLSearchParams(q);
}

function draftKey(sessionId) {
  return `inoss:s2:cu-entry:draft:${sessionId || "default"}`;
}

function decisionKey(sessionId) {
  return `inoss:s2:compare:decision:${sessionId || "default"}`;
}

function safeParse(s, fallback) {
  try {
    return JSON.parse(s);
  } catch {
    return fallback;
  }
}

function badgeStyle(status) {
  if (status === "ADA") return { background: "#0f5132", color: "white" };
  if (status === "TIADA") return { background: "#842029", color: "white" };
  return { background: "#333", color: "white" };
}

export default function System2Compare() {
  const params = useMemo(() => getQueryParams(), []);
  const sessionFromUrl = params.get("session") || "Masjid";

  const [sessionId, setSessionId] = useState(sessionFromUrl);
  const [meta, setMeta] = useState(null);
  const [cus, setCus] = useState([]);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [result, setResult] = useState(null);
  const [threshold, setThreshold] = useState(0.45);

  // keputusan manusia (override)
  // { [cuCode]: { finalStatus: "ADA"|"TIADA", finalCuCode?, finalCuTitle?, note? } }
  const [decisions, setDecisions] = useState({});

  // load draft (dari Page 2.1)
  useEffect(() => {
    const raw = localStorage.getItem(draftKey(sessionId));
    const draft = safeParse(raw, null);

    if (!draft?.cus?.length) {
      setMeta(null);
      setCus([]);
      return;
    }
    setMeta(draft.meta || null);
    setCus(draft.cus || []);
  }, [sessionId]);

  // load keputusan override (jika ada)
  useEffect(() => {
    const raw = localStorage.getItem(decisionKey(sessionId));
    const saved = safeParse(raw, {});
    setDecisions(saved || {});
  }, [sessionId]);

  function saveDecisions(next = decisions) {
    localStorage.setItem(decisionKey(sessionId), JSON.stringify(next));
  }

async function runCompare() {
  setLoading(true);
  setErr("");
  setResult(null);

  try {
    const body = {
      sessionId: String(sessionId || "").trim() || "dacum-demo",
      threshold: 0.45, // boleh ubah nanti jadi input UI
      // urls: [] // optional kalau nak override DEFAULT_MYSPIKE_URLS di backend
    };

    const res = await fetch(`${API_BASE}/api/myspike/compare`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(json?.error || `Compare gagal (HTTP ${res.status})`);
    }

    setResult(json);
  } catch (e) {
    setErr(String(e?.message || e));
  } finally {
    setLoading(false);
  }
}

  function setFinalStatus(cuCode, status) {
    const next = {
      ...decisions,
      [cuCode]: {
        ...(decisions[cuCode] || {}),
        finalStatus: status,
      },
    };
    setDecisions(next);
    saveDecisions(next);
  }

  function setFinalPick(cuCode, pick) {
    const next = {
      ...decisions,
      [cuCode]: {
        ...(decisions[cuCode] || {}),
        finalCuCode: pick?.cuCode || "",
        finalCuTitle: pick?.cuTitle || "",
        finalStatus: "ADA",
      },
    };
    setDecisions(next);
    saveDecisions(next);
  }

  function setNote(cuCode, note) {
    const next = {
      ...decisions,
      [cuCode]: {
        ...(decisions[cuCode] || {}),
        note,
      },
    };
    setDecisions(next);
    saveDecisions(next);
  }

  function goBack() {
    window.location.href = `/#/s2/cu-entry`;
  }

  function goNext() {
    // simpan keputusan & pergi page seterusnya (placeholder CPC)
    saveDecisions(decisions);
    window.location.href = `/#/s2/cpc?session=${encodeURIComponent(sessionId)}`;
  }

  const empty = !cus || cus.length === 0;

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0 }}>Sistem 2 — CU Basket Comparator (Page 2.2)</h1>
          <div style={{ marginTop: 6, color: "#444" }}>
            Sumber data: <b>MySPIKE sahaja</b> (AI mencadangkan padanan, manusia muktamadkan)
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
          <button onClick={goBack} style={{ padding: "10px 12px" }}>
            ← Kembali (Page 2.1)
          </button>
          <button
            onClick={() => window.open(`${API_BASE}/`, "_blank")}
            style={{ padding: "10px 12px" }}
            title="Buka backend status"
          >
            Backend
          </button>
        </div>
      </div>

      {/* Header */}
      <div
        style={{
          border: "1px solid #ddd",
          borderRadius: 12,
          padding: 16,
          marginTop: 16,
        }}
      >
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 13, color: "#666" }}>Session ID</div>
            <input
              value={sessionId}
              onChange={(e) => setSessionId(e.target.value)}
              style={{ padding: 10, minWidth: 260 }}
            />
          </div>

          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, color: "#666" }}>Tajuk NOSS</div>
            <div style={{ padding: "10px 0" }}>
              {meta?.nossTitle || <span style={{ color: "#999" }}>(tiada)</span>}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 13, color: "#666" }}>Kod NOSS (Base)</div>
            <div style={{ padding: "10px 0" }}>{meta?.nossCodeBase || "(tiada)"}</div>
          </div>

          <div>
            <div style={{ fontSize: 13, color: "#666" }}>Tahap</div>
            <div style={{ padding: "10px 0" }}>{meta?.level || "(tiada)"}</div>
          </div>
        </div>

        <div style={{ marginTop: 12, display: "flex", gap: 10 }}>
          <button
            onClick={runCompare}
            disabled={loading || empty}
            style={{
              padding: "10px 14px",
              border: "1px solid #111",
              background: "#111",
              color: "white",
              borderRadius: 12,
              opacity: loading || empty ? 0.6 : 1,
            }}
          >
            {loading ? "Running AI Comparison..." : "Run AI Comparison (MySPIKE)"}
          </button>

          <button
            onClick={goNext}
            disabled={!result}
            style={{
              padding: "10px 14px",
              border: "1px solid #0b5ed7",
              background: "#0b5ed7",
              color: "white",
              borderRadius: 12,
              opacity: !result ? 0.6 : 1,
            }}
            title={!result ? "Jalankan AI Comparison dahulu" : "Teruskan ke CPC"}
          >
            Teruskan ke CPC (Page 2.3)
          </button>
        </div>

        {empty && (
          <div style={{ marginTop: 12, color: "#a11" }}>
            Tiada data CU dari Page 2.1. Sila isi CU dahulu di <b>/#/s2/cu-entry</b>.
          </div>
        )}

        {err && (
          <div style={{ marginTop: 12, color: "#a11" }}>
            <b>Error:</b> {err}
          </div>
        )}

        {result?.summary && (
          <div style={{ marginTop: 12, color: "#333" }}>
            <b>Ringkasan:</b> {result.summary.totalCU} CU • ADA: {result.summary.ada} • TIADA:{" "}
            {result.summary.tiada} • Candidates(MySPIKE): {result.myspike?.totalCandidates}
          </div>
        )}
      </div>

      {/* Results */}
      {result?.results?.length ? (
        <div style={{ marginTop: 16, display: "grid", gap: 14 }}>
          {result.results.map((r, idx) => {
            const cuCode = r?.input?.cuCode || `CU_${idx + 1}`;
            const human = decisions[cuCode] || {};
            const aiStatus = r?.decision?.status;
            const finalStatus = human.finalStatus || aiStatus;

            return (
              <div
                key={`${cuCode}_${idx}`}
                style={{
                  border: "1px solid #ddd",
                  borderRadius: 12,
                  padding: 16,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <div>
                    <h3 style={{ margin: 0 }}>
                      {cuCode} — {r?.input?.cuTitle}
                    </h3>
                    <div style={{ marginTop: 6, color: "#444" }}>
                      Aktiviti: <b>{r?.input?.activitiesCount || 0}</b>
                    </div>
                  </div>

                  <div style={{ textAlign: "right" }}>
                    <div style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                      <span
                        style={{
                          ...badgeStyle(finalStatus),
                          padding: "6px 10px",
                          borderRadius: 999,
                          fontSize: 13,
                        }}
                      >
                        Final: {finalStatus}
                      </span>
                      <span
                        style={{
                          background: "#555",
                          color: "white",
                          padding: "6px 10px",
                          borderRadius: 999,
                          fontSize: 13,
                        }}
                        title="Confidence AI"
                      >
                        AI: {r?.decision?.confidence || "—"} ({r?.decision?.bestScore || 0})
                      </span>
                    </div>

                    <div style={{ marginTop: 10, display: "flex", gap: 8, justifyContent: "flex-end" }}>
                      <button
                        onClick={() => setFinalStatus(cuCode, "ADA")}
                        style={{ padding: "8px 10px" }}
                      >
                        Set ADA
                      </button>
                      <button
                        onClick={() => setFinalStatus(cuCode, "TIADA")}
                        style={{ padding: "8px 10px" }}
                      >
                        Set TIADA
                      </button>
                    </div>
                  </div>
                </div>

                {/* Matches */}
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontWeight: 700, marginBottom: 8 }}>Cadangan Padanan MySPIKE (Top)</div>

                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr>
                          <th style={{ textAlign: "left", borderBottom: "1px solid #eee", padding: 8 }}>#</th>
                          <th style={{ textAlign: "left", borderBottom: "1px solid #eee", padding: 8 }}>Kod CU</th>
                          <th style={{ textAlign: "left", borderBottom: "1px solid #eee", padding: 8 }}>Tajuk CU (MySPIKE)</th>
                          <th style={{ textAlign: "left", borderBottom: "1px solid #eee", padding: 8 }}>Score</th>
                          <th style={{ textAlign: "left", borderBottom: "1px solid #eee", padding: 8 }}>Tindakan</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(r.matches || []).map((m, i) => {
                          const picked =
                            human.finalCuCode === m.cuCode && human.finalCuTitle === m.cuTitle;
                          return (
                            <tr key={`${m.cuCode}_${i}`}>
                              <td style={{ borderBottom: "1px solid #f3f3f3", padding: 8 }}>{i + 1}</td>
                              <td style={{ borderBottom: "1px solid #f3f3f3", padding: 8 }}>
                                <b>{m.cuCode}</b>
                              </td>
                              <td style={{ borderBottom: "1px solid #f3f3f3", padding: 8 }}>{m.cuTitle}</td>
                              <td style={{ borderBottom: "1px solid #f3f3f3", padding: 8 }}>{m.score}</td>
                              <td style={{ borderBottom: "1px solid #f3f3f3", padding: 8 }}>
                                <button
                                  onClick={() => setFinalPick(cuCode, m)}
                                  style={{
                                    padding: "7px 10px",
                                    borderRadius: 10,
                                    border: picked ? "2px solid #0b5ed7" : "1px solid #ccc",
                                    background: picked ? "#e7f1ff" : "white",
                                  }}
                                  title="Pilih padanan MySPIKE sebagai rujukan Basket"
                                >
                                  {picked ? "Dipilih" : "Pilih"}
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Note */}
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 13, color: "#666" }}>
                      Catatan Fasi/Panel (justifikasi muktamad)
                    </div>
                    <textarea
                      value={human.note || ""}
                      onChange={(e) => setNote(cuCode, e.target.value)}
                      placeholder="Contoh: Tajuk sama, tapi konteks sektor berbeza. Kekalkan CU baharu / guna CU basket..."
                      style={{ width: "100%", padding: 10, marginTop: 6, minHeight: 70 }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
) : (
  <div style={{ marginTop: 16, color: "#666" }}>
    {!result ? (
      "Klik “Run AI Comparison” untuk mula."
    ) : (
      <>
        <div style={{ marginBottom: 8 }}>Tiada result berstruktur dipaparkan.</div>

        {/* DEBUG: paparkan response sebenar backend */}
        <pre
          style={{
            marginTop: 12,
            padding: 12,
            background: "#f6f6f6",
            borderRadius: 12,
            overflow: "auto",
            fontSize: 12,
          }}
        >
          {JSON.stringify(result, null, 2)}
        </pre>
      </>
    )}
  </div>
)
);
}
