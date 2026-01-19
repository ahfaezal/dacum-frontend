import React, { useEffect, useState } from "react";

const API_BASE =
  (import.meta?.env?.VITE_API_BASE && String(import.meta.env.VITE_API_BASE)) ||
  "https://dacum-backend.onrender.com";

function parseHash() {
  const h = String(window.location.hash || "#/s2/compare");
  const [, qs] = h.replace(/^#/, "").split("?");
  const params = new URLSearchParams(qs || "");
  return params;
}

function safeNumber(x, fallback = 0) {
  const n = Number(x);
  return Number.isFinite(n) ? n : fallback;
}

function pct(x) {
  const n = Number(x);
  if (!Number.isFinite(n)) return "";
  if (n <= 1) return `${Math.round(n * 100)}%`;
  return `${Math.round(n)}%`;
}

export default function System2Compare() {
  const [sessionId, setSessionId] = useState("Masjid");
  const [threshold, setThreshold] = useState(0.55);
  const [topK, setTopK] = useState(5);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  // ✅ hasil compare dari backend (normalized)
  const [results, setResults] = useState([]);

  // hydrate sessionId dari query string (hash)
  useEffect(() => {
    const params = parseHash();
    const sid = params.get("session");
    if (sid) setSessionId(String(sid));
  }, []);

  const decidedCount = 0; // STEP 2 nanti baru ada decision
  const itemCount = results.length;

  async function runCompare() {
    setLoading(true);
    setErr("");
    setResults([]);

    try {
      const res = await fetch(`${API_BASE}/api/myspike/compare`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: String(sessionId || "").trim() || "Masjid",
          threshold: safeNumber(threshold, 0.55),
          topK: safeNumber(topK, 5),
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json?.error || json?.detail || "Compare gagal");
      }

      // ✅ Backend pulang ARRAY terus
      const items = Array.isArray(json) ? json : [];

      // ✅ Normalise (pastikan field wujud & konsisten)
      const normalized = items.map((it, idx) => ({
        id: it?.id ?? `${Date.now()}_${idx}`,
        myspikeWA: String(it?.myspikeWA ?? it?.myspike ?? "").trim(),
        bestDacumWA: String(it?.bestDacumWA ?? it?.best ?? "").trim(),
        score: safeNumber(it?.score, 0),
        topK: Array.isArray(it?.topK) ? it.topK : [],
        raw: it,
      }));

      setResults(normalized);

      if (!normalized.length) {
        setErr(
          "Tiada item dipulangkan oleh backend. Semak seed WA & MySPIKE index."
        );
      }
    } catch (e) {
      setErr(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  const exportJson = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      sessionId,
      threshold,
      topK,
      totals: { items: itemCount, decided: decidedCount },
      results,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `s2-compare-${sessionId || "session"}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <h1 style={{ marginTop: 0 }}>Sistem 2 — MySPIKE Compare (Page 2.2)</h1>
      <p style={{ marginTop: 6, color: "#444" }}>
        Sistem bandingkan WA sebenar (DACUM) ↔ WA MySPIKE. Panel tentukan
        keputusan <b>ADA / TIADA</b>.
      </p>

      {/* Controls */}
      <div
        style={{
          border: "1px solid #ddd",
          borderRadius: 12,
          padding: 16,
          marginTop: 16,
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.2fr 1fr 1fr auto",
            gap: 12,
            alignItems: "end",
          }}
        >
          <label>
            Session ID
            <input
              value={sessionId}
              onChange={(e) => setSessionId(e.target.value)}
              style={{ width: "100%", padding: 10, marginTop: 6 }}
            />
          </label>

          <label>
            Threshold
            <input
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              style={{ width: "100%", padding: 10, marginTop: 6 }}
            />
          </label>

          <label>
            TopK
            <input
              value={topK}
              onChange={(e) => setTopK(e.target.value)}
              style={{ width: "100%", padding: 10, marginTop: 6 }}
            />
          </label>

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button
              onClick={runCompare}
              disabled={loading}
              style={{
                padding: "10px 14px",
                border: "1px solid #111",
                background: "#111",
                color: "white",
                borderRadius: 12,
                opacity: loading ? 0.7 : 1,
                cursor: loading ? "not-allowed" : "pointer",
                minWidth: 170,
              }}
            >
              {loading ? "Running..." : "Run Compare (Real)"}
            </button>

            <button
              onClick={exportJson}
              disabled={!results.length}
              style={{
                padding: "10px 14px",
                border: "1px solid #999",
                background: "white",
                borderRadius: 12,
                opacity: !results.length ? 0.5 : 1,
                cursor: !results.length ? "not-allowed" : "pointer",
              }}
            >
              Export JSON
            </button>
          </div>
        </div>

        <div style={{ marginTop: 12, color: "#333", textAlign: "right" }}>
          Items: <b>{itemCount}</b> • Decided: <b>{decidedCount}</b>
        </div>

        {err && (
          <div
            style={{
              marginTop: 12,
              padding: 12,
              border: "1px solid #f2b8b8",
              background: "#ffecec",
              borderRadius: 12,
              color: "#7a1f1f",
            }}
          >
            {err}
          </div>
        )}
      </div>

      {/* Results list */}
      <div style={{ marginTop: 18 }}>
        {!results.length ? (
          <div
            style={{
              marginTop: 12,
              padding: 14,
              border: "1px dashed #bbb",
              borderRadius: 12,
              color: "#444",
            }}
          >
            Tiada item untuk dibandingkan. Pastikan:
            <ul style={{ marginTop: 8 }}>
              <li>Anda sudah seed WA dari Page 2.1 (Sahkan &amp; Teruskan).</li>
              <li>
                MySPIKE index telah dibina (jika compare bergantung pada index).
              </li>
            </ul>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {results.map((r, idx) => (
              <div
                key={r.id}
                style={{
                  border: "1px solid #ddd",
                  borderRadius: 12,
                  padding: 16,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                    alignItems: "flex-start",
                  }}
                >
                  <div>
                    <div style={{ fontSize: 13, color: "#666" }}>
                      Item #{idx + 1}
                    </div>
                    <div style={{ marginTop: 8 }}>
                      <div style={{ fontWeight: 700 }}>WA MySPIKE</div>
                      <div style={{ marginTop: 6, color: "#222" }}>
                        {r.myspikeWA || <i>(tiada)</i>}
                      </div>
                    </div>
                  </div>

                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 13, color: "#666" }}>Skor</div>
                    <div style={{ fontSize: 22, fontWeight: 800 }}>
                      {pct(r.score)}
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: 14 }}>
                  <div style={{ fontWeight: 700 }}>Cadangan DACUM (Best Match)</div>
                  <div style={{ marginTop: 6, color: "#222" }}>
                    {r.bestDacumWA || <i>(tiada)</i>}
                  </div>
                </div>

                <div style={{ marginTop: 14 }}>
                  <div style={{ fontWeight: 700 }}>
                    Top {safeNumber(topK, 5)} Calon DACUM
                  </div>
                  <div style={{ marginTop: 8 }}>
                    {(r.topK || []).length ? (
                      <table
                        style={{
                          width: "100%",
                          borderCollapse: "collapse",
                          border: "1px solid #eee",
                        }}
                      >
                        <thead>
                          <tr style={{ background: "#fafafa" }}>
                            <th
                              style={{
                                textAlign: "left",
                                padding: 10,
                                borderBottom: "1px solid #eee",
                                width: 50,
                              }}
                            >
                              #
                            </th>
                            <th
                              style={{
                                textAlign: "left",
                                padding: 10,
                                borderBottom: "1px solid #eee",
                              }}
                            >
                              DACUM WA
                            </th>
                            <th
                              style={{
                                textAlign: "right",
                                padding: 10,
                                borderBottom: "1px solid #eee",
                                width: 90,
                              }}
                            >
                              Skor
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {r.topK
                            .slice(0, safeNumber(topK, 5))
                            .map((t, i) => (
                              <tr key={i}>
                                <td
                                  style={{
                                    padding: 10,
                                    borderBottom: "1px solid #f2f2f2",
                                    color: "#666",
                                  }}
                                >
                                  {i + 1}
                                </td>
                                <td
                                  style={{
                                    padding: 10,
                                    borderBottom: "1px solid #f2f2f2",
                                    color: "#222",
                                  }}
                                >
                                  {String(t?.dacumWA || "").trim() || (
                                    <i>(tiada)</i>
                                  )}
                                </td>
                                <td
                                  style={{
                                    padding: 10,
                                    borderBottom: "1px solid #f2f2f2",
                                    textAlign: "right",
                                    fontWeight: 700,
                                  }}
                                >
                                  {pct(t?.score)}
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    ) : (
                      <div style={{ color: "#666" }}>
                        Tiada TopK dipulangkan oleh backend untuk item ini.
                      </div>
                    )}
                  </div>
                </div>

                {/* STEP 2 akan letak ADA/TIADA di sini */}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
