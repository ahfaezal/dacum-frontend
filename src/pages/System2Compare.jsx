import React, { useEffect, useState } from "react";

const API_BASE =
  (import.meta?.env?.VITE_API_BASE && String(import.meta.env.VITE_API_BASE)) ||
  "https://dacum-backend.onrender.com";

// localStorage safe wrapper
function lsGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function lsSet(key, val) {
  try {
    localStorage.setItem(key, val);
  } catch {}
}

// Ambil query params dari hash: #/s2/compare?session=Masjid
function getHashParams() {
  const h = String(window.location.hash || "");
  const parts = h.split("?");
  const qs = parts[1] || "";
  return new URLSearchParams(qs);
}

export default function System2Compare() {
  const [sessionId, setSessionId] = useState("Masjid");
  const [threshold, setThreshold] = useState(0.55);
  const [topK, setTopK] = useState(5);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [data, setData] = useState(null);

  // keputusan human: localWaId -> "ADA"|"TIADA"
  const [decisions, setDecisions] = useState({});

  // init sessionId dari hash + load decisions cache
  useEffect(() => {
    const params = getHashParams();
    const sid = params.get("session") || "Masjid";
    setSessionId(sid);

    const cached = lsGet(`inoss:s2:compare:decisions:${sid}`);
    if (cached) {
      try {
        setDecisions(JSON.parse(cached) || {});
      } catch {}
    }
  }, []);

  // bila sessionId berubah, simpan decisions cache
  useEffect(() => {
    lsSet(`inoss:s2:compare:decisions:${sessionId}`, JSON.stringify(decisions));
  }, [sessionId, decisions]);

  async function runCompare() {
    setErr("");
    setLoading(true);
    try {
      const sid = String(sessionId || "").trim();
      if (!sid) throw new Error("Session ID kosong.");

      const res = await fetch(`${API_BASE}/api/myspike/compare`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: sid,
          threshold: Number(threshold),
          topK: Number(topK),
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.ok === false) {
        throw new Error(json?.error || `Compare gagal (HTTP ${res.status})`);
      }

      setData(json);
    } catch (e) {
      setData(null);
      setErr(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  function setDecision(localWaId, value) {
    setDecisions((prev) => ({ ...prev, [localWaId]: value }));
  }

  function exportDecisions() {
    const items = data?.items || [];
    const payload = {
      sessionId,
      exportedAt: new Date().toISOString(),
      threshold,
      topK,
      items: items.map((it) => ({
        localWaId: it.localWaId,
        cuTitle: it.cuTitle,
        cuCode: it.cuCode,
        waTitle: it.waTitle,
        waCode: it.waCode,
        best: it.best || null,
        candidates: it.candidates || [],
        decision: decisions[it.localWaId] || null,
      })),
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `s2_compare_${sessionId || "session"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const items = data?.items || [];
  const decidedCount = Object.keys(decisions || {}).length;

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: "0 auto" }}>
      <h1 style={{ marginTop: 0 }}>Sistem 2 — MySPIKE Compare (Page 2.2)</h1>
      <p style={{ marginTop: 6, color: "#444" }}>
        Sistem bandingkan WA sebenar (DACUM) ↔ WA MySPIKE. Panel tentukan keputusan{" "}
        <b>ADA</b> / <b>TIADA</b>.
      </p>

      <div
        style={{
          border: "1px solid #ddd",
          borderRadius: 12,
          padding: 14,
          marginTop: 12,
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          Session ID
          <input
            value={sessionId}
            onChange={(e) => setSessionId(e.target.value)}
            style={{ padding: 10, width: 220 }}
          />
        </label>

        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          Threshold
          <input
            type="number"
            step="0.01"
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
            style={{ padding: 10, width: 110 }}
          />
        </label>

        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          TopK
          <input
            type="number"
            step="1"
            value={topK}
            onChange={(e) => setTopK(e.target.value)}
            style={{ padding: 10, width: 90 }}
          />
        </label>

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
          }}
        >
          {loading ? "Comparing..." : "Run Compare (Real)"}
        </button>

        <button
          onClick={exportDecisions}
          disabled={!items.length}
          style={{ padding: "10px 14px", borderRadius: 12 }}
        >
          Export JSON
        </button>

        <div style={{ marginLeft: "auto", color: "#444" }}>
          Items: <b>{items.length}</b> • Decided: <b>{decidedCount}</b>
        </div>
      </div>

      {!!err && (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            border: "1px solid #ffb4b4",
            background: "#ffecec",
            borderRadius: 12,
          }}
        >
          {err}
        </div>
      )}

      {!loading && !err && items.length === 0 && (
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
            <li>Anda sudah seed WA dari Page 2.1 (Sahkan & Teruskan).</li>
            <li>MySPIKE index telah dibina (jika compare bergantung pada index).</li>
          </ul>
        </div>
      )}

      <div style={{ marginTop: 14, display: "grid", gap: 12 }}>
        {items.map((it, idx) => {
          const bestScore = typeof it?.best?.score === "number" ? it.best.score : null;
          const suggested =
            bestScore !== null && bestScore >= Number(threshold)
              ? "ADA (suggested)"
              : "TIADA (suggested)";

          const chosen = decisions[it.localWaId] || "";

          return (
            <div
              key={it.localWaId || idx}
              style={{ border: "1px solid #ddd", borderRadius: 12, padding: 14 }}
            >
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <div style={{ fontWeight: 800 }}>#{idx + 1}</div>
                <div style={{ color: "#444" }}>
                  <b>CU:</b> {it.cuCode ? `${it.cuCode} — ` : ""}{it.cuTitle || "-"}
                </div>
                <div style={{ marginLeft: "auto", color: "#444" }}>
                  Suggested: <b>{suggested}</b>
                </div>
              </div>

              <div style={{ marginTop: 10 }}>
                <div style={{ fontWeight: 800, marginBottom: 6 }}>WA Sebenar</div>
                <div style={{ padding: 10, background: "#f7f7f7", borderRadius: 10 }}>
                  {it.waCode ? <b>{it.waCode}</b> : null} {it.waTitle || "-"}
                </div>
              </div>

              <div style={{ marginTop: 10 }}>
                <div style={{ fontWeight: 800, marginBottom: 6 }}>Padanan MySPIKE (Top Match)</div>
                <div style={{ padding: 10, background: "#f7f7ff", borderRadius: 10 }}>
                  <div>
                    <b>Score:</b>{" "}
                    {bestScore === null ? "-" : bestScore.toFixed(3)}
                  </div>
                  <div>
                    <b>cpId:</b> {it?.best?.myspike?.cpId || "-"}
                  </div>
                  <div>
                    <b>WA MySPIKE:</b> {it?.best?.myspike?.myWaTitle || "-"}
                  </div>
                </div>
              </div>

              {Array.isArray(it.candidates) && it.candidates.length > 0 && (
                <details style={{ marginTop: 10 }}>
                  <summary style={{ cursor: "pointer" }}>
                    Lihat {it.candidates.length} cadangan lain
                  </summary>
                  <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
                    {it.candidates.map((c, k) => (
                      <div
                        key={k}
                        style={{
                          padding: 10,
                          border: "1px solid #eee",
                          borderRadius: 10,
                        }}
                      >
                        <div>
                          <b>Score:</b>{" "}
                          {typeof c.score === "number" ? c.score.toFixed(3) : "-"}
                        </div>
                        <div>
                          <b>cpId:</b> {c.cpId || "-"}
                        </div>
                        <div>
                          <b>WA:</b> {c.myWaTitle || "-"}
                        </div>
                      </div>
                    ))}
                  </div>
                </details>
              )}

              <div style={{ marginTop: 12, display: "flex", gap: 10, alignItems: "center" }}>
                <button
                  onClick={() => setDecision(it.localWaId, "ADA")}
                  style={{
                    padding: "10px 14px",
                    borderRadius: 12,
                    border: "1px solid #111",
                    background: chosen === "ADA" ? "#111" : "white",
                    color: chosen === "ADA" ? "white" : "#111",
                  }}
                >
                  ADA
                </button>
                <button
                  onClick={() => setDecision(it.localWaId, "TIADA")}
                  style={{
                    padding: "10px 14px",
                    borderRadius: 12,
                    border: "1px solid #111",
                    background: chosen === "TIADA" ? "#111" : "white",
                    color: chosen === "TIADA" ? "white" : "#111",
                  }}
                >
                  TIADA
                </button>

                <div style={{ marginLeft: "auto", color: "#444" }}>
                  Keputusan: <b>{chosen || "-"}</b>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
