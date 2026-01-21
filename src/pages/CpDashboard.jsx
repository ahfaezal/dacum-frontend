import React, { useEffect, useMemo, useState } from "react";

const API_BASE =
  (import.meta?.env?.VITE_API_BASE && String(import.meta.env.VITE_API_BASE)) ||
  "https://dacum-backend.onrender.com";

/**
 * Ambil query param daripada:
 * 1) window.location.search  -> ?session=Office-v3
 * 2) window.location.hash    -> #/cp?session=Office-v3
 */
function getQueryParam(name) {
  // 1) normal query: ?session=...
  const s = new URLSearchParams(window.location.search);
  const v1 = s.get(name);
  if (v1) return v1;

  // 2) hash query: #/cp?session=...
  const h = window.location.hash || "";
  const qIndex = h.indexOf("?");
  if (qIndex === -1) return "";
  const qs = h.slice(qIndex + 1);
  const hParams = new URLSearchParams(qs);
  return hParams.get(name) || "";
}

/**
 * Extractor kalis peluru untuk CU list daripada CPC JSON.
 * (Sebab struktur CPC boleh berbeza ikut versi backend / data source)
 */
function extractCuList(cpc) {
  if (!cpc) return [];

  // bentuk biasa
  if (Array.isArray(cpc.cus)) return cpc.cus;
  if (Array.isArray(cpc.units)) return cpc.units;
  if (Array.isArray(cpc.competencyUnits)) return cpc.competencyUnits;

  // kadang data dibungkus
  if (cpc.data) {
    if (Array.isArray(cpc.data.cus)) return cpc.data.cus;
    if (Array.isArray(cpc.data.units)) return cpc.data.units;
    if (Array.isArray(cpc.data.competencyUnits)) return cpc.data.competencyUnits;
  }

  // fallback: TERAS -> CU list
  const terases = cpc.terases || cpc.terasList || cpc.teras || cpc.data?.terases || [];
  const out = [];
  for (const t of terases) {
    const cuList = t.cus || t.cuList || t.units || t.competencyUnits || [];
    for (const cu of cuList) out.push(cu);
  }
  return out;
}

function getCuId(cu, idx) {
  return cu?.cuId || cu?.id || cu?.code || `C${String(idx + 1).padStart(2, "0")}`;
}

function getCuTitle(cu) {
  return cu?.cuTitle || cu?.title || cu?.name || cu?.cuName || "";
}

function extractWaListFromCu(cu) {
  // WA biasanya disimpan sebagai "activities" dalam CPC (C01-W01..)
  return cu?.activities || cu?.waList || cu?.workActivities || cu?.was || cu?.wa || [];
}

function getWaTitle(wa) {
  return wa?.waTitle || wa?.title || wa?.name || wa?.text || "";
}

function getWaId(wa, idx) {
  return wa?.waId || wa?.id || wa?.code || `W${String(idx + 1).padStart(2, "0")}`;
}

export default function CpDashboard() {
  const sessionId = getQueryParam("session");

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
    if (!sessionId || !cuId) return;
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

      // Pergi ke editor (HASH routing)
      window.location.href = `/#/cp-editor?session=${encodeURIComponent(
        sessionId
      )}&cu=${encodeURIComponent(cuId)}`;
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusyCu("");
    }
  }

  function goEdit(cuId) {
    if (!sessionId || !cuId) return;
    // HASH routing (bukan ?page=...)
    window.location.href = `/#/cp-editor?session=${encodeURIComponent(
      sessionId
    )}&cu=${encodeURIComponent(cuId)}`;
  }

  useEffect(() => {
    if (!sessionId) return;
    loadCpc();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const language = cpc?.language || cpc?.bahasa || cpc?.lang || cpc?.data?.language || "auto";

  const cuList = useMemo(() => extractCuList(cpc), [cpc]);

  return (
    <div style={{ padding: 16, fontFamily: "Arial, sans-serif" }}>
      <h2>CP Dashboard</h2>

      <div style={{ marginBottom: 8 }}>
        <b>Session:</b> {sessionId || <i>(tiada)</i>}
      </div>

      <div style={{ marginBottom: 8 }}>
        <b>Bahasa CPC:</b> {language}
      </div>

      {!sessionId && (
        <div style={{ color: "crimson", marginTop: 8 }}>
          Sila buka dengan URL:
          <div style={{ marginTop: 6 }}>
            <code>/#/cp?session=Office-v3</code>
          </div>
        </div>
      )}

      {err && <div style={{ color: "crimson", marginTop: 10 }}>{err}</div>}

      {sessionId && !cpc && <div style={{ marginTop: 12 }}>Loading CPC...</div>}

      {cpc && !cuList.length && (
        <div style={{ marginTop: 12, color: "crimson" }}>
          CPC berjaya dimuat (200 OK) tetapi senarai CU tidak ditemui dalam struktur data.
          <div style={{ fontSize: 13, opacity: 0.85, marginTop: 6 }}>
            Petunjuk: semak Response `/api/cpc/{sessionId}` untuk lihat di mana array CU disimpan.
          </div>
        </div>
      )}

      {!!cuList.length && (
        <div style={{ marginTop: 12 }}>
          <h3 style={{ margin: "12px 0" }}>Senarai CU (diambil terus dari CPC)</h3>

          {cuList.map((cu, idx) => {
            const cuId = getCuId(cu, idx);
            const cuTitle = getCuTitle(cu);
            const waList = extractWaListFromCu(cu);

            return (
              <div
                key={cuId}
                style={{
                  border: "1px solid #ddd",
                  borderRadius: 10,
                  padding: 12,
                  marginBottom: 12,
                  maxWidth: 860,
                  background: "#fff",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: "bold", fontSize: 15 }}>
                      {cuId}: {cuTitle}
                    </div>
                    <div style={{ fontSize: 13, opacity: 0.8, marginTop: 2 }}>
                      WA dalam CPC: {waList?.length || 0}
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <button disabled={busyCu === cuId} onClick={() => goEdit(cuId)}>
                      Edit CP
                    </button>

                    <button disabled={busyCu === cuId} onClick={() => generateDraft(cuId)}>
                      {busyCu === cuId ? "Generating..." : "Generate Draft"}
                    </button>
                  </div>
                </div>

                {/* Papar WA list (nama WA wajib ikut CPC) */}
                {waList?.length ? (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 13, fontWeight: "bold", marginBottom: 6 }}>
                      Work Activities (WA) — ikut CPC
                    </div>
                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                      {waList.map((wa, wIdx) => {
                        const waId = getWaId(wa, wIdx);
                        const waTitle = getWaTitle(wa);
                        return (
                          <li key={`${cuId}-${waId}-${wIdx}`} style={{ marginBottom: 4 }}>
                            <b>{waId}</b> — {waTitle}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ) : (
                  <div style={{ marginTop: 10, fontSize: 13, opacity: 0.75 }}>
                    (Tiada WA ditemui pada CU ini dalam CPC JSON.)
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
