import React, { useEffect, useState } from "react";

/**
 * CpcPage.jsx (Lengkap)
 * - Screen view: CPC grid sedia ada (mesra bengkel)
 * - Print view (JPK style): header table + bar + TERAS menegak + CU/WA box seperti contoh gambar
 *
 * Nota:
 * - Maklumat header JPK (Seksyen/Kumpulan/Bidang/Tajuk/Tahap/Kod) buat masa ini HARD-CODE.
 *   Nanti kita boleh jadikan dynamic dari backend.
 */

const API_BASE =
  (import.meta?.env?.VITE_API_BASE && String(import.meta.env.VITE_API_BASE)) ||
  "https://dacum-backend.onrender.com";

export default function CpcPage() {
  const url = new URL(window.location.href);
  const sessionId = url.searchParams.get("session") || "Masjid";

  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  // UX untuk screen
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  if (loading) return <div style={{ padding: 16 }}>Loading CPC...</div>;
  if (err) return <div style={{ padding: 16, color: "crimson" }}>{err}</div>;
  if (!data) return <div style={{ padding: 16 }}>Tiada data.</div>;

  // Normalisasi
  const teras = (data.teras && data.teras[0]) || {};
  const units = Array.isArray(data.units) ? data.units : [];

  // ====== HEADER JPK (hardcode dulu) ======
  // Ubah ikut kehendak Prof.
  const JPK = {
    seksyen: "(P) PENDIDIKAN",
    kumpulan: "(853) PENDIDIKAN TINGGI",
    bidang: "AKADEMIK",
    tajukNoss: "PENTADBIRAN PEJABAT",
    tahap: "TIGA (3)",
    kodNoss: "NOSS-XXX-3:2026",
  };

  return (
    <>
      <style>{`
@media print {
  @page { size: A4 landscape; margin: 8mm; }
  body { margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }

  .no-print { display: none !important; }
  .print-only { display: block !important; }
  .screen-only { display: none !important; }
}

@media screen {
  .print-only { display: none; }
  .screen-only { display: block; }
}

/* =========================
   PRINT (JPK STYLE)
   ========================= */
.jpk-header-table{
  width:100%;
  border-collapse:collapse;
  font-size:12px;
}
.jpk-header-table td{
  border:1px solid #000;
  padding:3px 6px;
  vertical-align:top;
}
.jpk-bar{
  width:100%;
  border:1px solid #000;
  background:#e6f3f8;
  padding:3px 6px;
  font-weight:700;
  text-align:center;
  font-size:12px;
}
.jpk-page-title{
  font-weight:700;
  font-size:18px;
  margin:0 0 6px 0;
}
.jpk-layout{
  display:grid;
  grid-template-columns: 46px 260px 1fr;
  gap:8px;
}
.jpk-teras-vertical{
  border:1px solid #000;
  background:#f2c94c;
  display:flex;
  align-items:center;
  justify-content:center;
  font-weight:700;
  writing-mode: vertical-rl;
  transform: rotate(180deg);
}
.jpk-cu-box{
  border:1px solid #000;
  background:#b7e08a;
  display:flex;
  flex-direction:column;
  min-height:118px;
}
.jpk-cu-title{
  padding:10px;
  font-weight:700;
  text-align:center;
  line-height:1.2;
  flex:1;
}
.jpk-cu-code{
  border-top:1px solid #000;
  background:#8fd06f;
  padding:4px 6px;
  text-align:center;
  font-weight:700;
  font-size:12px;
}
.jpk-wa-grid{
  display:grid;
  grid-template-columns: repeat(4, minmax(170px, 1fr));
  gap:8px;
  align-content:start;
}
.jpk-wa-box{
  border:1px solid #000;
  background:#fff;
  min-height:118px;
  display:flex;
  flex-direction:column;
}
.jpk-wa-title{
  padding:10px;
  font-weight:600;
  text-align:center;
  line-height:1.2;
  flex:1;
}
.jpk-wa-code{
  border-top:1px solid #000;
  background:#d6eefc;
  padding:4px 6px;
  text-align:center;
  font-weight:700;
  font-size:12px;
}

/* =========================
   SCREEN VIEW (current)
   ========================= */
.screen-wrap{
  padding:16px;
  font-family: Georgia, serif;
}
`}</style>

      {/* =========================
          SCREEN VIEW (UI)
         ========================= */}
      <div className="screen-only screen-wrap">
        <h2 style={{ margin: "0 0 12px" }}>Carta Profil Kompetensi (CPC)</h2>

        <div
          className="no-print"
          style={{
            display: "flex",
            gap: 10,
            alignItems: "center",
            marginBottom: 12,
            flexWrap: "wrap",
          }}
        >
          <button onClick={() => setCompact((v) => !v)}>
            {compact ? "Papar Penuh (WA)" : "Papar Ringkas (CU sahaja)"}
          </button>
          <button onClick={() => setFreeze((v) => !v)}>
            {freeze ? "Matikan Freeze" : "Hidupkan Freeze"}
          </button>
          <button onClick={() => window.print()}>Print (JPK Style)</button>
          <div style={{ opacity: 0.7 }}>
            Session: <b>{data.sessionId}</b>
          </div>
        </div>

        <div
          style={{
            border: "1px solid #ddd",
            padding: 8,
            marginBottom: 10,
            fontSize: 12,
            display: "flex",
            gap: 18,
            flexWrap: "wrap",
          }}
        >
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

        {/* Layout CPC (screen) */}
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
            <div style={{ fontWeight: 700, marginBottom: 6 }}>TERAS</div>
            <div style={{ fontWeight: 700, lineHeight: 1.2 }}>
              {teras.terasTitle || "Teras"}
            </div>
          </div>

          {/* CU + WA */}
          <div style={{ display: "grid", gap: 12 }}>
            {units.map((u, ui) => (
              <div
                key={u.cuCode || u.id || `${u.cuTitle}-${ui}`}
                style={{ border: "1px solid #333" }}
              >
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

      {/* =========================
          PRINT VIEW (JPK STYLE)
         ========================= */}
      <div className="print-only" style={{ fontFamily: "Georgia, serif" }}>
        <div className="jpk-page-title">Carta Profil Kompetensi (CPC)</div>

        {/* Header Table JPK */}
        <table className="jpk-header-table">
          <tbody>
            <tr>
              <td style={{ width: 140 }}><b>SEKSYEN</b></td>
              <td>{JPK.seksyen}</td>
            </tr>
            <tr>
              <td><b>KUMPULAN</b></td>
              <td>{JPK.kumpulan}</td>
            </tr>
            <tr>
              <td><b>BIDANG</b></td>
              <td>{JPK.bidang}</td>
            </tr>
            <tr>
              <td><b>TAJUK NOSS</b></td>
              <td>{JPK.tajukNoss}</td>
            </tr>
            <tr>
              <td><b>TAHAP NOSS</b></td>
              <td style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: 8 }}>
                <div>{JPK.tahap}</div>
                <div>
                  <b>KOD NOSS</b> &nbsp; {JPK.kodNoss}
                </div>
              </td>
            </tr>
          </tbody>
        </table>

        <div style={{ height: 8 }} />

        {/* Bars */}
        <div style={{ display: "grid", gridTemplateColumns: "306px 1fr", gap: 8 }}>
          <div className="jpk-bar">← UNIT KOMPETENSI →</div>
          <div className="jpk-bar">← AKTIVITI KERJA →</div>
        </div>

        <div style={{ height: 8 }} />

        {/* TERAS + CU + WA
            Nota: Untuk match contoh gambar dengan cepat, TERAS dipaparkan pada setiap row CU.
            Kalau Prof mahu TERAS hanya sekali sahaja (lebih tepat), kita boleh refactor selepas ini.
         */}
        {units.map((u, ui) => {
          const cuCode = u.cuCode || `C${String(ui + 1).padStart(2, "0")}`;
          const tCode = teras.terasCode || "T01";

          return (
            <div key={cuCode} style={{ marginBottom: 8 }}>
              <div className="jpk-layout">
                {/* TERAS Vertical */}
                <div className="jpk-teras-vertical">TERAS</div>

                {/* CU box */}
                <div className="jpk-cu-box">
                  <div className="jpk-cu-title">{u.cuTitle || "Unit Kompetensi"}</div>
                  <div className="jpk-cu-code">{`${tCode}-${cuCode}`}</div>
                </div>

                {/* WA grid */}
                <div className="jpk-wa-grid">
                  {(u.wa || u.activities || []).map((w, wi) => {
                    const waCode = w.waCode || `W${String(wi + 1).padStart(2, "0")}`;
                    return (
                      <div key={`${cuCode}-${waCode}`} className="jpk-wa-box">
                        <div className="jpk-wa-title">{w.waTitle || w.title || ""}</div>
                        <div className="jpk-wa-code">{`${tCode}-${cuCode}-${waCode}`}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
