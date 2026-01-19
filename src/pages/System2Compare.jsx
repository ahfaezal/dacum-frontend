import React, { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";

const API_BASE =
  (import.meta?.env?.VITE_API_BASE && String(import.meta.env.VITE_API_BASE)) ||
  "https://dacum-backend.onrender.com";

function useQuery() {
  const { search } = useLocation();
  return useMemo(() => new URLSearchParams(search), [search]);
}

export default function System2Compare() {
  const q = useQuery();
  const [sessionId, setSessionId] = useState(q.get("sessionId") || "Masjid");

  const [threshold, setThreshold] = useState(0.55);
  const [topK, setTopK] = useState(5);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [data, setData] = useState(null);

  // keputusan human
  const [decisions, setDecisions] = useState({}); // localWaId -> "ADA"|"TIADA"

  async function runCompare() {
    setErr("");
    setLoading(true);
    try {
      const sid = String(sessionId || "").trim();
      if (!sid) throw new Error("Session ID kosong.");

      const res = await fetch(`${API_BASE}/api/myspike/compare`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: sid, threshold: Number(threshold), topK: Number(topK) }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.ok === false) {
        throw new Error(json?.error || `Compare gagal (HTTP ${res.status})`);
      }

      setData(json);

      // reset decisions (optional) supaya tak bercampur session lama
      setDecisions({});
    } catch (e) {
      setErr(String(e?.message || e));
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // auto-run bila masuk page compare (kalau sessionId ada)
    if (String(sessionId || "").trim()) runCompare();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setDecision(localWaId, value) {
    setDecisions((prev) => ({ ...prev, [localWaId]: value }));
  }

  const items = data?.items || [];
  const decidedCount = Object.keys(decisions).length;

  function exportDecisions() {
    const payload = {
      sessionId,
      generatedAt: new Date().toISOString(),
      threshold,
      topK,
      decisions: items.map((it) => ({
        localWaId: it.localWaId,
        cuTitle: it.cuTitle,
        waTitle: it.waTitle,
        best: it.best || null,
        decision: decisions[it.localWaId] || null,
      })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `system2_decisions_${sessionId || "session"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div style={{ padding: 16, maxWidth: 1200, margin: "0 auto" }}>
      <h2 style={{ margin: "0 0 6px" }}>Sistem 2 — Compare (Human Decide ADA / TIADA)</h2>
      <div style={{ opacity: 0.8, marginBottom: 12 }}>
        Compare WA sebenar (DACUM) ↔ WA MySPIKE (index). Keputusan akhir dibuat oleh manusia.
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ minWidth: 90 }}>Session ID</div>
          <input
            value={sessionId}
            onChange={(e) => setSessionId(e.target.value)}
            style={{ padding: 8, width: 220 }}
          />
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ minWidth: 80 }}>Threshold</div>
          <input
            type="number"
            step="0.01"
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
            style={{ padding: 8, width: 110 }}
          />
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ minWidth: 50 }}>TopK</div>
          <input
            type="number"
            step="1"
            value={topK}
            onChange={(e) => setTopK(e.target.value)}
            style={{ padding: 8, width: 90 }}
          />
        </div>

        <button onClick={runCompare} disabled={loading} style={{ padding: "8px 12px" }}>
          {loading ? "Comparing..." : "Run Compare (Real)"}
        </button>

        <button
          onClick={exportDecisions}
          disabled={!items.length}
          style={{ padding: "8px 12px" }}
          title="Export keputusan (JSON) untuk audit / simpanan"
        >
          Export Decisions (JSON)
        </button>

        <div style={{ marginLeft: "auto", opacity: 0.85 }}>
          Items: <b>{items.length}</b> • Decided: <b>{decidedCount}</b>
        </div>
      </div>

      {err ? (
        <div style={{ padding: 10, background: "#ffecec", border: "1px solid #ffb4b4", marginBottom: 10 }}>
          {err}
        </div>
      ) : null}

      {!items.length && !loading ? (
        <div style={{ padding: 14, border: "1px dashed #bbb", borderRadius: 10, opacity: 0.85 }}>
          Tiada item untuk compare. Pastikan anda dah seed WA di Page 2.1 dan MySPIKE index wujud.
        </div>
      ) : null}

      {items.map((it, idx) => {
        const suggested =
          (it?.best?.score ?? 0) >= Number(threshold) ? "ADA (suggested)" : "TIADA (suggested)";
        const chosen = decisions[it.localWaId] || null;

        return (
          <div
            key={it.localWaId || idx}
            style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12, marginBottom: 12 }}
          >
            <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 8 }}>
              <div style={{ fontWeight: 700 }}>#{idx + 1}</div>
              <div style={{ opacity: 0.85 }}>
                <b>CU:</b> {it.cuTitle || "-"}
              </div>
              <div style={{ marginLeft: "auto", opacity: 0.8 }}>
                Suggested: <b>{suggested}</b>
              </div>
            </div>

            <div style={{ marginBottom: 10 }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>WA Sebenar (DACUM)</div>
              <div style={{ padding: 10, background: "#f7f7f7", borderRadius: 10 }}>
                {it.waTitle || "-"}
              </div>
            </div>

            <div style={{ marginBottom: 10 }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>Padanan MySPIKE (Top Match)</div>
              <div style={{ padding: 10, background: "#f7f7ff", borderRadius: 10 }}>
                <div>
                  <b>Score:</b> {typeof it?.best?.score === "number" ? it.best.score.toFixed(3) : "-"}
                </div>
                <div>
                  <b>cpId:</b> {it?.best?.myspike?.cpId || "-"}
                </div>
                <div>
                  <b>WA MySPIKE:</b> {it?.best?.myspike?.myWaTitle || "-"}
                </div>
              </div>
            </div>

            {Array.isArray(it.candidates) && it.candidates.length ? (
              <details style={{ marginBottom: 10 }}>
                <summary style={{ cursor: "pointer" }}>Lihat {it.candidates.length} cadangan lain</summary>
                <div style={{ marginTop: 8 }}>
                  {it.candidates.map((c, k) => (
                    <div
                      key={k}
                      style={{
                        padding: 10,
                        border: "1px solid #eee",
                        borderRadius: 10,
                        marginBottom: 8,
                      }}
                    >
                      <div>
                        <b>Score:</b> {typeof c.score === "number" ? c.score.toFixed(3) : "-"}
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
            ) : null}

            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <button
                onClick={() => setDecision(it.localWaId, "ADA")}
                style={{ padding: "8px 12px", fontWeight: chosen === "ADA" ? 800 : 400 }}
              >
                ADA
              </button>
              <button
                onClick={() => setDecision(it.localWaId, "TIADA")}
                style={{ padding: "8px 12px", fontWeight: chosen === "TIADA" ? 800 : 400 }}
              >
                TIADA
              </button>

              <div style={{ marginLeft: "auto", opacity: 0.85 }}>
                Keputusan: <b>{chosen || "-"}</b>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
