import React, { useEffect, useState } from "react";

const API_BASE =
  (import.meta?.env?.VITE_API_BASE && String(import.meta.env.VITE_API_BASE)) ||
  "https://dacum-backend.onrender.com";

export default function CpDashboard() {
  const params = new URLSearchParams(window.location.search);
  const sessionId = params.get("session") || "";

  const [cpc, setCpc] = useState(null);
  const [err, setErr] = useState("");
  const [busyCu, setBusyCu] = useState("");

  async function loadCpc() {
    setErr("");
    try {
      const r = await fetch(`${API_BASE}/api/cpc/${encodeURIComponent(sessionId)}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "Gagal load CPC");
      setCpc(j);
    } catch (e) {
      setErr(String(e));
    }
  }

  async function generateDraft(cuId) {
    setBusyCu(cuId);
    setErr("");
    try {
      const r = await fetch(`${API_BASE}/api/cp/draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, cuId }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "Gagal jana draft CP");
      // pergi ke editor
      window.location.href = `/?page=cp-editor&session=${encodeURIComponent(
        sessionId
      )}&cu=${encodeURIComponent(cuId)}`;
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusyCu("");
    }
  }

  useEffect(() => {
    if (sessionId) loadCpc();
  }, [sessionId]);

  const cus = cpc?.cus || cpc?.data?.cus || [];

  return (
    <div style={{ padding: 16, fontFamily: "Arial, sans-serif" }}>
      <h2>CP Dashboard</h2>
      <div style={{ marginBottom: 8 }}>
        <b>Session:</b> {sessionId || <i>(tiada)</i>}
      </div>

      {!sessionId && (
        <div style={{ color: "crimson" }}>
          Sila buka dengan parameter: <code>?page=cp&session=Office-v3</code>
        </div>
      )}

      {err && <div style={{ color: "crimson", marginTop: 8 }}>{err}</div>}

      {sessionId && !cpc && <div>Loading CPC...</div>}

      {cpc && (
        <div style={{ marginTop: 12 }}>
          <div style={{ marginBottom: 10 }}>
            <b>Bahasa CPC:</b> {cpc?.language || cpc?.bahasa || cpc?.lang || "auto"}
          </div>

          {cus.map((cu) => {
            const cuId = cu?.cuId || cu?.id || "";
            const cuTitle = cu?.cuTitle || cu?.title || "";
            const waCount = (cu?.wa || cu?.workActivities || []).length;

            return (
              <div
                key={cuId}
                style={{
                  border: "1px solid #ddd",
                  borderRadius: 8,
                  padding: 12,
                  marginBottom: 10,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <div>
                    <div style={{ fontWeight: "bold" }}>
                      {cuId}: {cuTitle}
                    </div>
                    <div style={{ fontSize: 13, opacity: 0.8 }}>WA: {waCount}</div>
                  </div>

                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <button
                      disabled={busyCu === cuId}
                      onClick={() =>
                        (window.location.href = `/?page=cp-editor&session=${encodeURIComponent(
                          sessionId
                        )}&cu=${encodeURIComponent(cuId)}`)
                      }
                    >
                      Edit CP
                    </button>

                    <button disabled={busyCu === cuId} onClick={() => generateDraft(cuId)}>
                      {busyCu === cuId ? "Generating..." : "Generate Draft"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
