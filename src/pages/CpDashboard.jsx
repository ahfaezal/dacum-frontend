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
 * Extractor CU list dari CPC JSON (kalis peluru, tetapi kita tetap LOCK ID ikut CPC).
 */
function extractCuList(cpc) {
  if (!cpc) return [];

  if (Array.isArray(cpc.cus)) return cpc.cus;
  if (Array.isArray(cpc.units)) return cpc.units;
  if (Array.isArray(cpc.competencyUnits)) return cpc.competencyUnits;

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

/**
 * LOCKED: CU Code mesti ikut CPC
 * Utama: cuCode (contoh: "c01")
 * Fallback (legacy): cuId/id/code (jika backend lama)
 * TIADA auto-generate "C01" lagi.
 */
function getCuCodeCanonical(cu) {
  return String(cu?.cuCode || cu?.cuId || cu?.id || cu?.code || "")
    .trim()
    .toLowerCase();
}

/**
 * Tajuk CU (ikut CPC)
 */
function getCuTitle(cu) {
  return String(cu?.cuTitle || cu?.title || cu?.name || cu?.cuName || "").trim();
}

function extractWaListFromCu(cu) {
  // Dalam CPC anda: wa: [{ waCode, waTitle }]
  return cu?.wa || cu?.waList || cu?.workActivities || cu?.activities || cu?.was || [];
}

/**
 * LOCKED: WA ID MESTI ikut CPC
 * Utama: waCode (contoh: "w01")
 * Fallback (legacy): waId/id/code
 * TIADA auto-generate "W01" lagi.
 */
function getWaIdCanonical(wa) {
  return String(wa?.waCode || wa?.waId || wa?.id || wa?.code || "").trim();
}

function getWaTitle(wa) {
  return String(wa?.waTitle || wa?.title || wa?.name || wa?.text || "").trim();
}

/**
 * Untuk paparan sahaja (cantik): "c01" -> "C01"
 * Jangan guna untuk hantar ke backend.
 */
function displayCode(code) {
  return String(code || "").trim().toUpperCase();
}

export default function CpDashboard() {
  const sessionId = getQueryParam("session");

  const [cpc, setCpc] = useState(null);
  const [err, setErr] = useState("");
  const [busyCu, setBusyCu] = useState("");
  const [loading, setLoading] = useState(false);

  async function loadCpc() {
    if (!sessionId) return;
    setLoading(true);
    setErr("");
    try {
      const r = await fetch(`${API_BASE}/api/cpc/${encodeURIComponent(sessionId)}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "Gagal load CPC");
      setCpc(j);
    } catch (e) {
      setErr(String(e?.message || e));
      setCpc(null);
    } finally {
      setLoading(false);
    }
  }

  /**
   * Generate Draft CP
   * LOCKED: Hantar cuCode (bukan auto-generate C01, bukan idx)
   * Behaviour: POST draft -> simpan sessionStorage -> reload ke cp-editor
   */
  async function generateDraft(cuCode) {
    const cuCodeCanon = String(cuCode || "").trim().toLowerCase();
    if (!sessionId || !cuCodeCanon) {
      setErr("CU Code tidak sah (tiada cuCode/cuId dalam CPC).");
      return;
    }

    setBusyCu(cuCodeCanon);
    setErr("");

    try {
      // Cari CU berdasarkan CPC (kalis peluru ikut extractCuList)
      const cuArr = extractCuList(cpc);
      const cu = (cuArr || []).find((x) => getCuCodeCanonical(x) === cuCodeCanon);
      if (!cu) throw new Error("CU tidak ditemui dalam CPC.");

      const cuTitle = getCuTitle(cu);
      const waObjs = extractWaListFromCu(cu) || [];
      const waList = waObjs.map(getWaTitle).map((s) => String(s || "").trim()).filter(Boolean);

      // 1) Jana draft di backend
      const r = await fetch(`${API_BASE}/api/cp/draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          cuCode: cuCodeCanon,
          cuTitle,
          waList,
        }),
      });

      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || "Gagal jana draft CP");

      // 2) Simpan draft (optional) untuk CpEditor load cepat
      try {
        sessionStorage.setItem(
          `cpDraft:${sessionId}:${cuCodeCanon}`,
          JSON.stringify({
            sessionId,
            cuCode: cuCodeCanon,
            cuTitle,
            waList,
            ...j,
            generatedAt: new Date().toISOString(),
          })
        );
      } catch (e) {}

      // 3) Pergi ke editor (FULL reload - paling pasti)
      window.location.href = `/#/cp-editor?session=${encodeURIComponent(
        sessionId
      )}&cu=${encodeURIComponent(cuCodeCanon)}&fromDraft=1`;
    } catch (e) {
      console.error(e);
      setErr(String(e?.message || e));
    } finally {
      setBusyCu("");
    }
  }

  function goEdit(cuCode) {
    const cuCodeCanon = String(cuCode || "").trim().toLowerCase();
    if (!sessionId || !cuCodeCanon) {
      setErr("CU Code tidak sah (tiada cuCode/cuId dalam CPC).");
      return;
    }
    window.location.href = `/#/cp-editor?session=${encodeURIComponent(
      sessionId
    )}&cu=${encodeURIComponent(cuCodeCanon)}`;
  }

  useEffect(() => {
    if (!sessionId) return;
    loadCpc();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const language =
    cpc?.lang ||
    cpc?.language ||
    cpc?.bahasa ||
    cpc?.data?.lang ||
    cpc?.data?.language ||
    "auto";

  const cuListRaw = useMemo(() => extractCuList(cpc), [cpc]);

  // Normalise CU list: pastikan setiap CU ada cuCodeCanonical (jika tiada, kita tanda invalid)
  const cuList = useMemo(() => {
    return (cuListRaw || []).map((cu) => {
      const cuCodeCanon = getCuCodeCanonical(cu);
      const cuTitle = getCuTitle(cu);
      const waList = extractWaListFromCu(cu) || [];
      return {
        _raw: cu,
        cuCodeCanon,
        cuTitle,
        waList,
      };
    });
  }, [cuListRaw]);

  const hasInvalidCu = cuList.some((x) => !x.cuCodeCanon);

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

      {sessionId && (loading || (!cpc && !err)) && (
        <div style={{ marginTop: 12 }}>Loading CPC...</div>
      )}

      {cpc && !cuListRaw?.length && (
        <div style={{ marginTop: 12, color: "crimson" }}>
          CPC berjaya dimuat (200 OK) tetapi senarai CU tidak ditemui dalam struktur data.
          <div style={{ fontSize: 13, opacity: 0.85, marginTop: 6 }}>
            Semak response <code>/api/cpc/{`{sessionId}`}</code> — pastikan CU berada dalam{" "}
            <code>units</code> atau <code>cus</code>.
          </div>
        </div>
      )}

      {cpc && !!cuListRaw?.length && (
        <div style={{ marginTop: 12 }}>
          <h3 style={{ margin: "12px 0" }}>Senarai CU (diambil terus dari CPC)</h3>

          {hasInvalidCu && (
            <div
              style={{
                border: "1px solid #f5c2c7",
                background: "#f8d7da",
                color: "#842029",
                padding: 10,
                borderRadius: 10,
                maxWidth: 860,
                marginBottom: 12,
                fontSize: 13,
              }}
            >
              Ada CU yang <b>tiada</b> <code>cuCode</code>/<code>cuId</code> dalam CPC. Sistem{" "}
              <b>tidak</b> akan auto-generate ID kerana kita lock “ikut CPC”.
            </div>
          )}

          {cuList.map((item, idx) => {
            const cuCodeCanon = item.cuCodeCanon; // contoh: "c01"
            const cuTitle = item.cuTitle;
            const waList = item.waList || [];
            const isInvalid = !cuCodeCanon;

            // untuk paparan cantik sahaja
            const cuDisplay = displayCode(cuCodeCanon) || `(CU#${idx + 1} tiada ID)`;

            return (
              <div
                key={cuCodeCanon || `cu-${idx}`}
                style={{
                  border: "1px solid #ddd",
                  borderRadius: 10,
                  padding: 12,
                  marginBottom: 12,
                  maxWidth: 860,
                  background: "#fff",
                  opacity: isInvalid ? 0.85 : 1,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: "bold", fontSize: 15 }}>
                      {cuDisplay}: {cuTitle || <span style={{ opacity: 0.7 }}>(tiada tajuk)</span>}
                    </div>

                    <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>
                      <b>CU Code (CPC):</b>{" "}
                      {cuCodeCanon ? (
                        <code>{cuCodeCanon}</code>
                      ) : (
                        <span style={{ color: "crimson" }}>tiada (wajib ada cuCode/cuId)</span>
                      )}
                    </div>

                    <div style={{ fontSize: 13, opacity: 0.8, marginTop: 4 }}>
                      WA dalam CPC: {waList.length}
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <button
                      disabled={isInvalid || busyCu === cuCodeCanon}
                      onClick={() => goEdit(cuCodeCanon)}
                      title={isInvalid ? "CU tiada cuCode/cuId dalam CPC" : ""}
                    >
                      Edit CP
                    </button>

                    <button
                      disabled={isInvalid || busyCu === cuCodeCanon}
                      onClick={() => generateDraft(cuCodeCanon)}
                      title={isInvalid ? "CU tiada cuCode/cuId dalam CPC" : ""}
                    >
                      {busyCu === cuCodeCanon ? "Generating..." : "Generate Draft"}
                    </button>
                  </div>
                </div>

                {/* Papar WA list (ikut CPC) */}
                {waList.length ? (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 13, fontWeight: "bold", marginBottom: 6 }}>
                      Work Activities (WA) — ikut CPC
                    </div>
                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                      {waList.map((wa, wIdx) => {
                        const waIdCanon = getWaIdCanonical(wa);
                        const waTitle = getWaTitle(wa);
                        const waDisplay = displayCode(waIdCanon) || `(WA#${wIdx + 1} tiada ID)`;
                        const waInvalid = !waIdCanon;

                        return (
                          <li
                            key={`${cuCodeCanon || idx}-${waIdCanon || `wa-${wIdx}`}`}
                            style={{ marginBottom: 4 }}
                          >
                            <b>{waDisplay}</b> —{" "}
                            {waTitle || <span style={{ opacity: 0.7 }}>(tiada tajuk)</span>}
                            {waInvalid && (
                              <span style={{ marginLeft: 8, color: "crimson", fontSize: 12 }}>
                                (tiada waCode/waId dalam CPC)
                              </span>
                            )}
                            {!waInvalid && (
                              <span style={{ marginLeft: 8, opacity: 0.7, fontSize: 12 }}>
                                <code>{waIdCanon}</code>
                              </span>
                            )}
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
