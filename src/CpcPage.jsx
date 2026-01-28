import React, { useEffect, useMemo, useState } from "react";

const API_BASE =
  (import.meta?.env?.VITE_API_BASE && String(import.meta.env.VITE_API_BASE)) ||
  "https://dacum-backend.onrender.com";

/**
 * Ambil query param daripada:
 * 1) window.location.search  -> ?session=Office-v3
 * 2) window.location.hash    -> #/cpc?session=Office-v3
 */
function getQueryParam(name) {
  const s = new URLSearchParams(window.location.search);
  const v1 = s.get(name);
  if (v1) return v1;

  const h = window.location.hash || "";
  const qIndex = h.indexOf("?");
  if (qIndex === -1) return "";
  const qs = h.slice(qIndex + 1);
  const p = new URLSearchParams(qs);
  return p.get(name) || "";
}

function pad2(n) {
  const x = Number(n) || 0;
  return String(x).padStart(2, "0");
}

function safeStr(x) {
  return String(x ?? "").trim();
}

/**
 * Normalizer:
 * Cuba terima pelbagai bentuk payload:
 * - { ok, sessionId, lang, generatedAt, blocks:[{cuTitle, activities:[{waTitle}]}] }
 * - { cus:[{cuTitle, activities:[{waTitle}]}] }
 * - [{ cuTitle, activities:[{waTitle}]}]
 * - { teras:[{ cus:[...] }]}  (kalau ada TERAS)
 */
function normalizeCpcPayload(payload, fallback = {}) {
  const nowIso = new Date().toISOString();

  // default
  let sessionId = safeStr(payload?.sessionId) || safeStr(fallback.sessionId) || "";
  let lang = safeStr(payload?.lang) || safeStr(fallback.lang) || "MS";
  let generatedAt = payload?.generatedAt || payload?.generated || nowIso;

  // 1) If already has teras blocks
  if (Array.isArray(payload?.teras) && payload.teras.length) {
    // Flatten teras->cus
    const cus = payload.teras
      .flatMap((t) => (Array.isArray(t?.cus) ? t.cus : []))
      .filter(Boolean);
    return {
      sessionId,
      lang,
      generatedAt,
      cus: cus.map((c, idx) => ({
        cuTitle: safeStr(c?.cuTitle || c?.title || c?.name || `CU-${pad2(idx + 1)}`),
        activities: (
          Array.isArray(c?.activities) ? c.activities :
          Array.isArray(c?.wa) ? c.wa :
          Array.isArray(c?.was) ? c.was :
          []
        )
          .filter(Boolean)
          .map((a, j) => ({
            waTitle: safeStr(a?.waTitle || a?.title || a?.name || `Aktiviti ${j + 1}`),
          })),
      })),
    };
  }

  // 2) If payload has cus
  if (Array.isArray(payload?.cus)) {
    return {
      sessionId,
      lang,
      generatedAt,
      cus: payload.cus.map((c, idx) => ({
        cuTitle: safeStr(c?.cuTitle || c?.title || c?.name || `CU-${pad2(idx + 1)}`),
        activities: (
          Array.isArray(c?.activities) ? c.activities :
          Array.isArray(c?.wa) ? c.wa :
          Array.isArray(c?.was) ? c.was :
          []
        )
          .filter(Boolean)
          .map((a, j) => ({
            waTitle: safeStr(a?.waTitle || a?.title || a?.name || `Aktiviti ${j + 1}`),
          })),
      })),
    };
  }

  // 3) If payload itself is array of CU
  if (Array.isArray(payload)) {
    return {
      sessionId,
      lang,
      generatedAt,
      cus: payload.map((c, idx) => ({
        cuTitle: safeStr(c?.cuTitle || c?.title || c?.name || `CU-${pad2(idx + 1)}`),
        activities: (
          Array.isArray(c?.activities) ? c.activities :
          Array.isArray(c?.wa) ? c.wa :
          Array.isArray(c?.was) ? c.was :
          []
        )
          .filter(Boolean)
          .map((a, j) => ({
            waTitle: safeStr(a?.waTitle || a?.title || a?.name || `Aktiviti ${j + 1}`),
          })),
      })),
    };
  }

  // 4) If payload has "blocks" or "items"
  const maybeCus =
    (Array.isArray(payload?.blocks) && payload.blocks) ||
    (Array.isArray(payload?.items) && payload.items) ||
    [];

  if (Array.isArray(maybeCus) && maybeCus.length) {
    return {
      sessionId,
      lang,
      generatedAt,
      cus: maybeCus.map((c, idx) => ({
        cuTitle: safeStr(c?.cuTitle || c?.title || c?.name || `CU-${pad2(idx + 1)}`),
        activities: (
          Array.isArray(c?.activities) ? c.activities :
          Array.isArray(c?.wa) ? c.wa :
          Array.isArray(c?.was) ? c.was :
          []
        )
          .filter(Boolean)
          .map((a, j) => ({
            waTitle: safeStr(a?.waTitle || a?.title || a?.name || `Aktiviti ${j + 1}`),
          })),
      })),
    };
  }

  // 5) fallback empty
  return { sessionId, lang, generatedAt, cus: [] };
}

export default function CpcPage() {
  const [sessionId, setSessionId] = useState(() => getQueryParam("session") || getQueryParam("sessionId") || "");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [raw, setRaw] = useState(null);

  useEffect(() => {
    // update if url changes
    const onPop = () => {
      const sid = getQueryParam("session") || getQueryParam("sessionId") || "";
      setSessionId(sid);
    };
    window.addEventListener("popstate", onPop);
    window.addEventListener("hashchange", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("hashchange", onPop);
    };
  }, []);

  async function fetchCpc(sid) {
    const url = `${API_BASE}/api/cpc/${encodeURIComponent(sid)}`;
    const r = await fetch(url, { method: "GET" });
    if (!r.ok) {
      const t = await r.text().catch(() => "");
      throw new Error(t || `HTTP ${r.status}`);
    }
    return r.json();
  }

  useEffect(() => {
    if (!safeStr(sessionId)) return;
    let alive = true;
    setLoading(true);
    setErr("");
    setRaw(null);

    fetchCpc(sessionId)
      .then((data) => {
        if (!alive) return;
        setRaw(data);
      })
      .catch((e) => {
        if (!alive) return;
        setErr(e?.message || "Gagal ambil data CPC");
      })
      .finally(() => {
        if (!alive) return;
        setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [sessionId]);

  const model = useMemo(() => {
    return normalizeCpcPayload(raw, { sessionId, lang: "MS" });
  }, [raw, sessionId]);

  const generatedHuman = useMemo(() => {
    try {
      const d = new Date(model.generatedAt);
      if (Number.isNaN(d.getTime())) return safeStr(model.generatedAt);
      return d.toLocaleString("ms-MY");
    } catch {
      return safeStr(model.generatedAt);
    }
  }, [model.generatedAt]);

  const title = "Carta Profil Kompetensi (CPC)";

  const printNow = () => window.print();

  return (
    <div className="cpc-root">
      <style>{`
        :root{
          --cpc-green:#8ad17a;
          --cpc-blue:#cfe9ff;
          --cpc-border:#2f2f2f;
          --muted:#555;
        }
        .cpc-root{ padding: 12px; font-family: Arial, Helvetica, sans-serif; }
        .cpc-topbar{
          display:flex; align-items:center; gap:10px; flex-wrap:wrap;
          margin-bottom: 8px;
        }
        .btn{
          border:1px solid #222; background:#f5f5f5; padding:6px 10px; cursor:pointer;
          border-radius:4px; font-size: 13px;
        }
        .btn:hover{ background:#eee; }
        .badge{ font-size:13px; color:#111; }
        .badge span{ color: var(--muted); }
        .header{
          border:1px solid var(--cpc-border);
          padding:10px 12px;
          margin-bottom:10px;
          background:#fff;
        }
        .header h1{
          font-size: 24px; margin:0 0 6px 0; font-weight:700;
        }
        .meta{
          display:flex; gap:14px; flex-wrap:wrap; font-size:13px;
        }
        .meta b{ font-weight:700; }
        .meta .muted{ color: var(--muted); }
        .divider{ height:1px; background:#ddd; margin:10px 0; }

        .section{
          border:1px solid var(--cpc-border);
          margin-bottom:12px;
          break-inside: avoid;
          page-break-inside: avoid;
        }
        .section-title{
          background: var(--cpc-green);
          border-bottom:1px solid var(--cpc-border);
          padding:10px 12px;
          font-size:16px;
          font-weight:700;
        }
        .wa-grid{
          display:grid;
          grid-template-columns: repeat(5, minmax(160px, 1fr));
          gap:10px;
          padding:10px;
        }
        .wa-box{
          background: var(--cpc-blue);
          border:1px solid var(--cpc-border);
          padding:10px 10px;
          min-height:72px;
        }
        .wa-code{
          font-weight:700;
          margin-bottom:6px;
          font-size:14px;
        }
        .wa-title{
          font-size:13px;
          line-height:1.25;
        }

        .empty{
          padding: 12px;
          color: #333;
          font-size: 14px;
        }
        .error{
          color:#b00020; border:1px solid #b00020; background:#fff0f1;
          padding:10px 12px; border-radius:6px; margin-bottom:10px;
        }

        /* Print */
        @media print{
          .cpc-topbar{ display:none !important; }
          .cpc-root{ padding: 0; }
          .header{ border: none; padding: 0 0 8px 0; }
          .section{ break-inside: avoid; page-break-inside: avoid; }
          @page { size: A4 landscape; margin: 10mm; }
          a[href]:after { content: "" !important; }
        }

        /* Responsive fallback (screen kecil) */
        @media (max-width: 1100px){
          .wa-grid{ grid-template-columns: repeat(2, minmax(160px, 1fr)); }
        }
        @media (max-width: 600px){
          .wa-grid{ grid-template-columns: 1fr; }
        }
      `}</style>

      <div className="cpc-topbar">
        <button className="btn" onClick={printNow} title="Cetak dalam format CPC">
          Print (JPK Style)
        </button>
        <div className="badge">
          <span>Session:</span> <b>{safeStr(model.sessionId) || "-"}</b>
        </div>
        <div className="badge">
          <span>Bahasa:</span> <b>{safeStr(model.lang || "MS").toUpperCase()}</b>
        </div>
        <div className="badge">
          <span>Generated:</span> <b>{generatedHuman || "-"}</b>
        </div>
      </div>

      {err ? <div className="error">Ralat: {err}</div> : null}

      <div className="header">
        <h1>{title}</h1>
        <div className="meta">
          <div>
            <span className="muted">Session:</span> <b>{safeStr(model.sessionId) || "-"}</b>
          </div>
          <div>
            <span className="muted">Bahasa:</span> <b>{safeStr(model.lang || "MS").toUpperCase()}</b>
          </div>
          <div>
            <span className="muted">Generated:</span> <b>{generatedHuman || "-"}</b>
          </div>
        </div>
        <div className="divider" />
      </div>

      {loading ? <div className="empty">Memuatkan CPC...</div> : null}

      {!loading && (!model.cus || model.cus.length === 0) ? (
        <div className="empty">
          Tiada data CPC untuk dipaparkan. Pastikan session ini sudah dijana (Generate) dan endpoint backend memulangkan data.
        </div>
      ) : null}

      {!loading &&
        (model.cus || []).map((cu, i) => {
          const cuNo = i + 1;
          const cCode = `C${pad2(cuNo)}`;
          const cuTitle = safeStr(cu?.cuTitle) || `CU-${pad2(cuNo)}`;
          const acts = Array.isArray(cu?.activities) ? cu.activities : [];

          return (
            <div className="section" key={`cu-${i}`}>
              <div className="section-title">
                {cCode}: {cuTitle}
              </div>

              <div className="wa-grid">
                {acts.length ? (
                  acts.map((a, j) => {
                    const wNo = j + 1;
                    const wCode = `W${pad2(wNo)}`;
                    const boxCode = `${cCode}-${wCode}`;
                    const waTitle = safeStr(a?.waTitle) || `Aktiviti ${wNo}`;

                    return (
                      <div className="wa-box" key={`wa-${i}-${j}`}>
                        <div className="wa-code">{boxCode}</div>
                        <div className="wa-title">{waTitle}</div>
                      </div>
                    );
                  })
                ) : (
                  <div className="wa-box">
                    <div className="wa-code">{`${cCode}-W01`}</div>
                    <div className="wa-title">—</div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
    </div>
  );
}
