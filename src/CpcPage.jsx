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

  // UX
  const [compact, setCompact] = useState(false); // Ringkas/Penuh
  const [freeze, setFreeze] = useState(true);    // Freeze ON/OFF

  async function load() {
    setLoading(true);
    setErr("");
    try {
      const r = await fetch(`${API_BASE}/api/cpc/${encodeURIComponent(sessionId)}`);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  if (loading) return <div style={{ padding: 16 }}>Loading CPC...</div>;
  if (err) return <div style={{ padding: 16, color: "crimson" }}>{err}</div>;
  if (!data) return <div style={{ padding: 16 }}>Tiada data.</div>;

  const teras = (data.teras && data.teras[0]) || {};
  const units = Array.isArray(data.units) ? data.units : [];

  return (
    <>
      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 12mm; }
          body { margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print { display: none !important; }
          .print-page { padding: 0; }
        }
      `}</style>

      <div className="print-page" style={{ padding: 16, fontFamily: "Georgia, serif" }}>
        <h2 style={{ margin: "0 0 12px" }}>Carta Profil Kompetensi (CPC)</h2>

        {/* Header CPC (boleh ubah jadi dynamic kemudian) */}
        <div
          style={{
            border: "1px solid #000",
            padding: 10,
            marginBottom: 12,
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 10,
          }}
        >
          <div>
            <div><b>Nama NOSS:</b> Pentadbiran Pejabat</div>
            <div><b>Tahap:</b> 3</div>
          </div>
          <div>
            <div><b>Kod NOSS:</b> NOSS-XXX-3</div>
            <div><b>Tahun:</b> 2026</div>
          </div>
        </div>

        {/* Controls (tak keluar masa print) */}
        <div className="no-print" style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12 }}>
          <button onClick={() => setCompact((v) => !v)}>
            {compact ? "Papar Penuh (WA)" : "Papar Ringkas (CU sahaja)"}
          </button>
          <button onClick={() => setFreeze((v) => !v)}>
            {freeze ? "Matikan Freeze" : "Hidupkan Freeze"}
          </button>
          <button onClick={() => window.print()}>Print CPC (A4 Landscape)</button>
          <div style={{ opacity: 0.7 }}>
            Session: <b>{data.sessionId}</b>
          </div>
        </div>

        {/* Meta */}
        <div style={{ border: "1px solid #ddd", padding: 12, marginBottom: 12 }}>
          <div><b>Session:</b> {data.sessionId}</div>
          {data.lang && <div><b>Bahasa:</b> {data.lang}</div>}
          {data.generatedAt && <div><b>Generated:</b> {data.generatedAt}</div>}
        </div>

        {/* Layout CPC */}
        <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 12 }}>
          {/* TERAS */}
          <div
            style={{
              border: "1px solid #333",
              padding: 12,
              background: "#f2c94c",
              position: freeze ? "sticky" : "static",
              top: freeze ? 10 : "auto",
              alignSelf: "start",
              zIndex: 3,
              height: "fit-content",
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 8 }}>TERAS</div>
            <div style={{ fontWeight: 700 }}>{teras.terasTitle || "Teras"}</div>
          </div>

          {/* CU + WA */}
          <div style={{ display: "grid", gap: 12 }}>
            {units.map((u, ui) => (
              <div key={u.cuCode || u.id || `${u.cuTitle}-${ui}`} style={{ border: "1px solid #333" }}>
                <div
                  style={{
                    background: "#8bd17c",
                    padding: 10,
                    fontWeight: 700,
                    position: freeze ? "sticky" : "static",
                    top: freeze ? 10 : "auto",
                    zIndex: 2,
                  }}
                >
                  {u.cuCode ? `${u.cuCode}: ` : ""}
                  {u.cuTitle || "Unit Kompetensi"}
                </div>

                {!compact && (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                      gap: 10,
                      padding: 10,
                      alignItems: "stretch",
                    }}
                  >
                    {(u.wa || u.activities || []).map((w, wi) => (
                      <div
                        key={`${u.cuCode || ui}-${w.waCode || w.id || w.waTitle || wi}`}
                        style={{
                          border: "1px solid #333",
                          background: "#d6eefc",
                          padding: 10,
                          minHeight: 70,
                        }}
                      >
                        <div style={{ fontWeight: 700 }}>
                          {w.waCode ? `${u.cuCode || `C${ui + 1}`}-${w.waCode}` : ""}
                        </div>
                        <div>{w.waTitle || w.title || ""}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
