import React, { useEffect, useMemo, useState } from "react";

const API_BASE =
  (import.meta?.env?.VITE_API_BASE && String(import.meta.env.VITE_API_BASE)) ||
  "https://dacum-backend.onrender.com";

/**
 * Ambil query param daripada:
 * 1) window.location.search  -> ?session=Office-v3
 * 2) window.location.hash    -> #/cocu-dashboard?session=Office-v3
 */
function getQueryParam(name) {
  const s = new URLSearchParams(window.location.search);
  const v1 = s.get(name);
  if (v1) return v1;

  const h = window.location.hash || "";
  const qIndex = h.indexOf("?");
  if (qIndex === -1) return "";
  const qs = h.slice(qIndex + 1);
  const hParams = new URLSearchParams(qs);
  return hParams.get(name) || "";
}

function safeStr(x) {
  return String(x ?? "").trim();
}

/** Extractor CU list dari CPC JSON (kalis peluru). */
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
  const terases =
    cpc.terases || cpc.terasList || cpc.teras || cpc.data?.terases || [];
  const out = [];
  for (const t of terases) {
    const cuList =
      t.cus || t.cuList || t.units || t.competencyUnits || [];
    for (const cu of cuList) out.push(cu);
  }
  return out;
}

/** LOCKED: CU Code mesti ikut CPC */
function getCuCodeCanonical(cu) {
  return safeStr(cu?.cuCode || cu?.cuId || cu?.id || cu?.code).toLowerCase();
}
function getCuTitle(cu) {
  return safeStr(cu?.cuTitle || cu?.title || cu?.name || cu?.cuName);
}

function extractWaListFromCu(cu) {
  return cu?.wa || cu?.waList || cu?.workActivities || cu?.activities || cu?.was || [];
}
function getWaIdCanonical(wa) {
  return safeStr(wa?.waCode || wa?.waId || wa?.id || wa?.code).toLowerCase();
}
function getWaTitle(wa) {
  return safeStr(wa?.waTitle || wa?.title || wa?.name || wa?.text);
}

function displayCode(code) {
  return safeStr(code).toUpperCase();
}
function pad2(n) {
  const x = Number(n) || 0;
  return String(x).padStart(2, "0");
}

/**
 * Normalize draft CoCU dari backend (kalis peluru).
 * Target UI:
 * {
 *   waItems: [
 *     { waCode, waTitle, knowledge, skills, attitude, criteria }
 *   ]
 * }
 */
function normalizeCoCuDraftFromApi(j, cuFromCpc) {
  const out = { waItems: [] };

  const waItems =
    (Array.isArray(j?.waItems) && j.waItems) ||
    (Array.isArray(j?.items) && j.items) ||
    (Array.isArray(j?.was) && j.was) ||
    [];

  if (waItems.length) {
    out.waItems = waItems.map((w, wi) => ({
      waCode: safeStr(w?.waCode || w?.code || w?.id || `w${pad2(wi + 1)}`).toLowerCase(),
      waTitle: safeStr(w?.waTitle || w?.title || w?.name || `WA ${wi + 1}`),
      knowledge: safeStr(w?.knowledge || w?.pengetahuan || w?.k || ""),
      skills: safeStr(w?.skills || w?.kemahiran || w?.s || ""),
      attitude: safeStr(w?.attitude || w?.sikap || w?.keselamatan || w?.a || ""),
      criteria: safeStr(w?.criteria || w?.kriteria || w?.assessmentCriteria || w?.c || ""),
    }));
    return out;
  }

  // fallback: bina dari CPC WA list + placeholder
  const waFromCpc = extractWaListFromCu(cuFromCpc) || [];
  out.waItems = waFromCpc.map((wa, wi) => ({
    waCode: getWaIdCanonical(wa) || `w${pad2(wi + 1)}`,
    waTitle: getWaTitle(wa) || `WA ${wi + 1}`,
    knowledge: "",
    skills: "",
    attitude: "",
    criteria: "",
  }));
  return out;
}

export default function CoCUDashboard() {
  const sessionId = getQueryParam("session");

  const [cpc, setCpc] = useState(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const [busyCu, setBusyCu] = useState("");
  const [draftCache, setDraftCache] = useState({}); // { [cuCodeCanon]: payload }

  function goCpc() {
    const sid = encodeURIComponent(safeStr(sessionId));
    window.location.hash = `#/cpc?session=${sid}`;
  }
  function goCluster() {
    const sid = encodeURIComponent(safeStr(sessionId));
    window.location.hash = `#/cluster?session=${sid}`;
  }

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

  // Load draftCache dari sessionStorage bila masuk page
  useEffect(() => {
    if (!sessionId) return;
    try {
      const prefix = `cocuDraft:${sessionId}:`;
      const out = {};
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i);
        if (!k || !k.startsWith(prefix)) continue;
        const cuCode = k.slice(prefix.length);
        const v = sessionStorage.getItem(k);
        if (!v) continue;
        out[cuCode] = JSON.parse(v);
      }
      setDraftCache(out);
    } catch (e) {
      // ignore
    }
  }, [sessionId]);

  function clearDraftCache() {
    if (!sessionId) return;
    try {
      const prefix = `cocuDraft:${sessionId}:`;
      const toDel = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i);
        if (k && k.startsWith(prefix)) toDel.push(k);
      }
      toDel.forEach((k) => sessionStorage.removeItem(k));
    } catch (e) {}
    setDraftCache({});
  }

  /**
   * AI Assisted: Jana Pengetahuan/Kemahiran/Sikap/Kriteria untuk setiap WA dalam CU
   * LOCKED: CU & WA ikut CPC (tak ubah title/id)
   *
   * Endpoint dicadangkan:
   * POST /api/cocu/draft
   * body: { sessionId, cuCode, cuTitle, waList:[{waCode, waTitle}], ai:{ language:"MS" } }
   */
  async function generateCoCuForCu(cuCodeCanon) {
    const cuCode = safeStr(cuCodeCanon).toLowerCase();
    if (!sessionId || !cuCode) {
      setErr("CU Code tidak sah.");
      return;
    }

    setBusyCu(cuCode);
    setErr("");

    try {
      const cuArr = extractCuList(cpc);
      const cu = (cuArr || []).find((x) => getCuCodeCanonical(x) === cuCode);
      if (!cu) throw new Error("CU tidak ditemui dalam CPC.");

      const cuTitle = getCuTitle(cu);
      const waObjs = extractWaListFromCu(cu) || [];
      const waList = waObjs
        .map((w) => ({
          waCode: getWaIdCanonical(w),
          waTitle: getWaTitle(w),
        }))
        .filter((w) => w.waCode && w.waTitle);

      if (!waList.length) throw new Error("Tiada WA ditemui untuk CU ini (CPC).");

      const r = await fetch(`${API_BASE}/api/cocu/draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          cuCode,
          cuTitle,
          waList,
          ai: {
            language: "MS",
            format: "table_per_WA",
          },
        }),
      });

      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        // bantu Ts nampak jelas kalau backend belum siap
        throw new Error(
          j?.error ||
            `Gagal jana CoCU (AI). Pastikan backend ada endpoint POST /api/cocu/draft.`
        );
      }

      const normalized = normalizeCoCuDraftFromApi(j, cu);

      const payloadToStore = {
        sessionId,
        cuCode,
        cuTitle,
        ...normalized,
        generatedAt: new Date().toISOString(),
      };

      setDraftCache((prev) => ({ ...prev, [cuCode]: payloadToStore }));

      try {
        sessionStorage.setItem(
          `cocuDraft:${sessionId}:${cuCode}`,
          JSON.stringify(payloadToStore)
        );
      } catch (e) {}
    } catch (e) {
      console.error(e);
      setErr(String(e?.message || e));
    } finally {
      setBusyCu("");
    }
  }

  function goEdit(cuCodeCanon) {
    const cuCode = safeStr(cuCodeCanon).toLowerCase();
    if (!sessionId || !cuCode) {
      setErr("CU Code tidak sah.");
      return;
    }
    window.location.href = `/#/cocu-editor?session=${encodeURIComponent(
      sessionId
    )}&cu=${encodeURIComponent(cuCode)}`;
  }

  useEffect(() => {
    if (!sessionId) return;
    loadCpc();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const language =
    cpc?.lang || cpc?.language || cpc?.bahasa || cpc?.data?.lang || cpc?.data?.language || "auto";

  const cuListRaw = useMemo(() => extractCuList(cpc), [cpc]);

  const cuList = useMemo(() => {
    return (cuListRaw || []).map((cu) => {
      const cuCodeCanon = getCuCodeCanonical(cu);
      const cuTitle = getCuTitle(cu);
      const waList = extractWaListFromCu(cu) || [];
      return { _raw: cu, cuCodeCanon, cuTitle, waList };
    });
  }, [cuListRaw]);

  const hasInvalidCu = cuList.some((x) => !x.cuCodeCanon);

  return (
    <div style={{ padding: 16, maxWidth: 1200, margin: "0 auto" }}>
      <h2 style={{ margin: "8px 0 12px" }}>CoCU Dashboard</h2>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <button onClick={goCluster}>← Ke Cluster</button>
        <button onClick={goCpc}>Lihat CPC</button>
        <button onClick={() => window.print()} disabled={!sessionId}>
          Print (CoCU)
        </button>
        <button onClick={clearDraftCache} disabled={!sessionId}>
          Clear Draft Cache
        </button>
      </div>

      <div style={{ marginBottom: 10, fontSize: 14 }}>
        <div>
          <b>Session:</b> {sessionId || "(tiada)"}
        </div>
        <div>
          <b>Bahasa CPC:</b> {language}
        </div>
      </div>

      {!sessionId && (
        <div style={{ background: "#fff3cd", padding: 10, borderRadius: 8 }}>
          Sila buka dengan URL:
          <div style={{ marginTop: 6, fontFamily: "monospace" }}>
            {`/#/cocu-dashboard?session=Office-v3`}
          </div>
        </div>
      )}

      {err && (
        <div style={{ background: "#fde2e2", padding: 10, borderRadius: 8, marginTop: 10 }}>
          <b>Error:</b> {err}
        </div>
      )}

      {sessionId && (loading || (!cpc && !err)) && (
        <div style={{ marginTop: 12 }}>Loading CPC...</div>
      )}

      {cpc && !cuListRaw?.length && (
        <div style={{ marginTop: 12 }}>
          CPC berjaya dimuat (200 OK) tetapi senarai CU tidak ditemui dalam struktur data.
          <br />
          Semak response <code>/api/cpc/{sessionId}</code> — pastikan CU berada dalam <code>cus</code>.
        </div>
      )}

      {cpc && !!cuListRaw?.length && (
        <div style={{ marginTop: 12 }}>
          <h3 style={{ margin: "12px 0" }}>Senarai CU (diambil terus dari CPC)</h3>

          {hasInvalidCu && (
            <div style={{ background: "#fff3cd", padding: 10, borderRadius: 8, marginBottom: 10 }}>
              Ada CU yang tiada <code>cuCode</code>/<code>cuId</code> dalam CPC. Sistem tidak akan auto-generate ID.
            </div>
          )}

          {cuList.map((item, idx) => {
            const cuCodeCanon = item.cuCodeCanon; // contoh: "c01"
            const cuTitle = item.cuTitle;
            const waList = item.waList || [];
            const isInvalid = !cuCodeCanon;

            const cuDisplay = displayCode(cuCodeCanon) || `(CU#${idx + 1} tiada ID)`;

            const draft = cuCodeCanon ? draftCache[cuCodeCanon] : null;

            // Kalau tiada draft, guna WA dari CPC + placeholder kosong
            const waItemsForTable = (() => {
              if (draft?.waItems?.length) return draft.waItems;
              return waList.map((wa, wi) => ({
                waCode: getWaIdCanonical(wa) || `w${pad2(wi + 1)}`,
                waTitle: getWaTitle(wa) || `WA ${wi + 1}`,
                knowledge: "",
                skills: "",
                attitude: "",
                criteria: "",
              }));
            })();

            return (
              <div
                key={cuDisplay + idx}
                style={{
                  border: "1px solid #ddd",
                  borderRadius: 10,
                  padding: 12,
                  marginBottom: 14,
                  background: "#fff",
                }}
              >
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                  <div style={{ flex: "1 1 420px" }}>
                    <div style={{ fontSize: 16, fontWeight: 700 }}>
                      {cuDisplay}: {cuTitle || "(tiada tajuk)"}
                    </div>
                    <div style={{ fontSize: 13, marginTop: 4 }}>
                      <b>CU Code (CPC):</b> {cuCodeCanon ? cuCodeCanon : "tiada"} {" | "}
                      <b>WA dalam CPC:</b> {waList.length} {" | "}
                      <b>Draft:</b>{" "}
                      {draft?.generatedAt
                        ? `✅ Ada (${new Date(draft.generatedAt).toLocaleString("ms-MY")})`
                        : "❌ Belum"}
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      onClick={() => goEdit(cuCodeCanon)}
                      disabled={isInvalid}
                      title={isInvalid ? "CU tiada cuCode/cuId dalam CPC" : ""}
                    >
                      Edit CoCU
                    </button>
                    <button
                      onClick={() => generateCoCuForCu(cuCodeCanon)}
                      disabled={isInvalid}
                      title={isInvalid ? "CU tiada cuCode/cuId dalam CPC" : ""}
                    >
                      {busyCu === cuCodeCanon ? "Generating..." : "AI Generate CoCU"}
                    </button>
                  </div>
                </div>

                {/* Jadual ikut rajah (Aktiviti Kerja dari WA, lain-lain dari draft/placeholder) */}
                <div style={{ marginTop: 12, overflowX: "auto" }}>
                  <div style={{ fontSize: 13, marginBottom: 6 }}>
                    <b>{cuDisplay}</b>: <span>Ambil dari CU (tidak boleh diubah)</span>
                  </div>

                  <table
                    style={{
                      width: "100%",
                      borderCollapse: "collapse",
                      fontSize: 13,
                      minWidth: 980,
                    }}
                  >
                    <thead>
                      <tr>
                        <th style={th}>AKTIVITI KERJA</th>
                        <th style={th}>PENGETAHUAN BERKAITAN</th>
                        <th style={th}>KEMAHIRAN BERKAITAN</th>
                        <th style={th}>SIKAP/ KESELAMATAN/ PERSEKITARAN</th>
                        <th style={th}>KRITERIA PENILAIAN</th>
                      </tr>
                    </thead>

                    <tbody>
                      {waItemsForTable.map((w, wi) => {
                        const no = wi + 1;
                        const waTitle = safeStr(w?.waTitle);
                        const waCode = safeStr(w?.waCode);

                        // Placeholder nombor macam rajah: 1.1, 2.1, 3.1 ...
                        const idxTag = `${no}.1`;

                        return (
                          <tr key={(waCode || `wa-${no}`) + "-" + no}>
                            <td style={td}>
                              <div style={{ fontWeight: 700 }}>
                                {no}. {waTitle || "(tiada tajuk WA)"}
                              </div>
                              <div style={{ fontSize: 12, marginTop: 6, color: "#b10000" }}>
                                Ambil dari WA (tidak boleh diubah)
                              </div>
                              {waCode && (
                                <div style={{ fontSize: 12, marginTop: 6 }}>
                                  <b>WA Code:</b> <code>{waCode}</code>
                                </div>
                              )}
                            </td>

                            <td style={td}>
                              {safeStr(w?.knowledge) ? (
                                <pre style={pre}>{safeStr(w?.knowledge)}</pre>
                              ) : (
                                <span style={placeholder}>{idxTag}</span>
                              )}
                            </td>

                            <td style={td}>
                              {safeStr(w?.skills) ? (
                                <pre style={pre}>{safeStr(w?.skills)}</pre>
                              ) : (
                                <span style={placeholder}>{idxTag}</span>
                              )}
                            </td>

                            <td style={td}>
                              {safeStr(w?.attitude) ? (
                                <pre style={pre}>{safeStr(w?.attitude)}</pre>
                              ) : (
                                <span style={placeholder}>{idxTag}</span>
                              )}
                            </td>

                            <td style={td}>
                              {safeStr(w?.criteria) ? (
                                <pre style={pre}>{safeStr(w?.criteria)}</pre>
                              ) : (
                                <span style={placeholder}>{idxTag}</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  <div style={{ marginTop: 8, fontSize: 12, color: "#555" }}>
                    <i>
                      Nota: Aktiviti Kerja (WA) & CU dikunci ikut CPC. Kolum lain boleh dijana AI atau
                      dilengkapkan melalui editor CoCU.
                    </i>
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

// styles kecil (kekal simple, senang print)
const th = {
  border: "1px solid #000",
  padding: "10px 8px",
  background: "#e9e9e9",
  textAlign: "center",
  verticalAlign: "middle",
};
const td = {
  border: "1px solid #000",
  padding: "10px 8px",
  verticalAlign: "top",
};
const pre = {
  margin: 0,
  whiteSpace: "pre-wrap",
  fontFamily: "inherit",
};
const placeholder = {
  color: "#444",
  fontWeight: 700,
};
