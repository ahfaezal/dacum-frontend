import React, { useEffect, useState } from "react";

const API_BASE =
  (import.meta?.env?.VITE_API_BASE && String(import.meta.env.VITE_API_BASE)) ||
  "https://dacum-backend.onrender.com";

export default function CpcPage() {
  const url = new URL(window.location.href);
  const sessionId = url.searchParams.get("session") || "Masjid";

  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [compact, setCompact] = useState(false);
  const [freeze, setFreeze] = useState(true);

  async function load() {
    setLoading(true);
    setErr("");
    try {
      const r = await fetch(
        `${API_BASE}/api/cpc/${encodeURIComponent(sessionId)}`
      );
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "Gagal load CPC");
      setData(j);
    } catch (e) {
      setErr(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [sessionId]);

  if (loading) return <div style={{ padding: 16 }}>Loading CPC...</div>;
  if (err) return <div style={{ padding: 16, color: "crimson" }}>{err}</div>;
  if (!data) return <div style={{ padding: 16 }}>Tiada data.</div>;

  // normalisasi sikit (ikut apa yang backend hantar)
  const teras = (data.teras && data.teras[0]) || {};
  const units = data.units || data.cus || [];

  return (
  <>
    <style>{`
      @media print {
        @page {
          size: A4 landscape;
          margin: 12mm;
        }

        body {
          margin: 0;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }

        .no-print {
          display: none !important;
        }

        .print-page {
          padding: 0;
        }
      }
    `}</style>

      <div className="print-page" style={{ padding: 16, fontFamily: "Georgia, serif" }}>
        <h2 style={{ margin: "0 0 12px" }}>Carta Profil Kompetensi (CPC)</h2>

      <div style={{ border: "1px solid #ddd", padding: 12, marginBottom: 12 }}>
        <div>
          <b>Session:</b> {data.sessionId}
        </div>
        {data.lang && (
          <div>
            <b>Bahasa:</b> {data.lang}
          </div>
        )}
        {data.generatedAt && (
          <div>
            <b>Generated:</b> {data.generatedAt}
          </div>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 12 }}>
        {/* TERAS */}
        <div style={{ border: "1px solid #333", padding: 12, background: "#f2c94c" }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>TERAS</div>
          <div style={{ fontWeight: 700 }}>{teras.terasTitle || "Teras"}</div>
        </div>

        {/* CU + WA */}
        <div style={{ display: "grid", gap: 12 }}>
          {units.map((u) => (
            <div key={u.cuCode || u.id || u.cuTitle} style={{ border: "1px solid #333" }}>
              <div style={{ background: "#8bd17c", padding: 10, fontWeight: 700 }}>
                {u.cuCode ? `${u.cuCode}: ` : ""}
                {u.cuTitle || "Unit Kompetensi"}
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(4, minmax(180px, 1fr))",
                  gap: 10,
                  padding: 10,
                }}
              >
                {(u.wa || u.activities || []).map((w) => (
                  <div
                    key={`${u.cuCode}-${w.waCode}`}
                    style={{
                      border: "1px solid #333",
                      background: "#d6eefc",
                      padding: 10,
                      minHeight: 70,
                    }}
                  >
                    <div style={{ fontWeight: 700 }}>
                      {u.cuCode}-{w.waCode}
                    </div>
                    <div>{w.waTitle || w.title || ""}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
