import React, { useEffect, useMemo, useState } from "react";

const API_BASE =
  (import.meta?.env?.VITE_API_BASE && String(import.meta.env.VITE_API_BASE)) ||
  "https://dacum-backend.onrender.com";

/**
 * Ambil query param daripada:
 * 1) window.location.search  -> ?session=Office-v3
 * 2) window.location.hash    -> #/cp-dashboard?session=Office-v3
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

/**
 * Extractor CU list dari CPC JSON (kalis peluru).
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
 */
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
 * Normalize draft yang balik dari backend (kalis peluru).
 * Menyokong struktur:
 * - { cpDraft: { waItems:[ {waCode,waTitle, ws:[{wsCode,wsTitle,pc}]} ] } }
 * - { waItems:[...] }
 * - { wa:[...] } / { items:[...] }
 */
function normalizeDraftFromApi(apiObjOrDraft, cuFromCpc) {
  // ✅ ambil root sebenar jika backend bungkus bawah cpDraft/draft/cp
  const root =
    apiObjOrDraft?.cpDraft ||
    apiObjOrDraft?.draft ||
    apiObjOrDraft?.cp ||
    apiObjOrDraft;

  const out = { waItems: [] };

  // 1) Cuba ambil WA grouping daripada backend
  const waItems =
    (Array.isArray(root?.waItems) && root.waItems) ||
    (Array.isArray(root?.waList) && root.waList) ||
    (Array.isArray(root?.wa) && root.wa) ||
    (Array.isArray(root?.items) && root.items) ||
    [];

  if (waItems.length) {
    out.waItems = waItems.map((w, wi) => {
      const waCode = safeStr(
        w?.waCode ||
          w?.code ||
          w?.id ||
          // fallback: guna WA dari CPC ikut index
          extractWaListFromCu(cuFromCpc)?.[wi]?.waCode ||
          `w${pad2(wi + 1)}`
      ).toLowerCase();

      const waTitle = safeStr(
        w?.waTitle ||
          w?.title ||
          w?.name ||
          extractWaListFromCu(cuFromCpc)?.[wi]?.waTitle ||
          `WA ${wi + 1}`
      );

      // 2) WS array (backend mungkin guna ws / wsItems / steps / workSteps)
      const wsArr =
        (Array.isArray(w?.ws) && w.ws) ||
        (Array.isArray(w?.wsItems) && w.wsItems) ||
        (Array.isArray(w?.workSteps) && w.workSteps) ||
        (Array.isArray(w?.steps) && w.steps) ||
        [];

      const ws = wsArr.map((s, si) => {
        const wsCode = safeStr(s?.wsCode || s?.code || `${wi + 1}.${si + 1}`);
        const wsTitle = safeStr(s?.wsTitle || s?.title || s?.text || "xxx");

        // PC mungkin berada di s.pc atau s.performanceCriteria atau s.criteria
        // Ada backend letak pc sebagai array; kita join jika perlu
        let pcVal = s?.pc ?? s?.performanceCriteria ?? s?.criteria ?? "xxx";
        if (Array.isArray(pcVal)) pcVal = pcVal.map((x) => safeStr(x)).filter(Boolean).join("; ");
        const pc = safeStr(pcVal || "xxx");

        return { wsCode, wsTitle, pc };
      });

      return { waCode, waTitle, ws };
    });

    return out;
  }

  // 3) Kalau backend tak bagi grouping, fallback dari CPC supaya UI tak rosak
  const waFromCpc = extractWaListFromCu(cuFromCpc) || [];
  out.waItems = waFromCpc.map((wa, wi) => ({
    waCode: getWaIdCanonical(wa) || `w${pad2(wi + 1)}`,
    waTitle: getWaTitle(wa) || `WA ${wi + 1}`,
    ws: [],
  }));

  return out;
}

export default function CpDashboard() {
  const sessionId = getQueryParam("session");

  const [cpc, setCpc] = useState(null);
  const [err, setErr] = useState("");
  const [busyCu, setBusyCu] = useState("");
  const [loading, setLoading] = useState(false);

  // draftCache: { [cuCodeCanon]: { waItems:[...] , generatedAt } }
  const [draftCache, setDraftCache] = useState({});

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
      const j = await r.json().catch(() => ({}));
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
      const prefix = `cpDraft:${sessionId}:`;
      const out = {};
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i);
        if (!k || !k.startsWith(prefix)) continue;
        const cuCode = safeStr(k.slice(prefix.length)).toLowerCase();
        const v = sessionStorage.getItem(k);
        if (!v) continue;
        out[cuCode] = JSON.parse(v);
      }
      setDraftCache(out);
    } catch (e) {
      // ignore
    }
  }, [sessionId]);

  /**
   * AI Assisted: Generate WS+PC untuk semua WA dalam CU
   * LOCKED: WA & CU kekal ikut CPC
   * Rule:
   * - minimum 3 WS per WA
   * - 1 PC per WS
   * - PC gaya "telah ..." (past tense, measurable)
   */
  async function generateWsPcForCu(cuCodeCanon) {
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

      // WA LOCKED: hantar sebagai objek (code+title) supaya backend boleh kekalkan ID
      const waList = waObjs
        .map((w) => ({
          waCode: getWaIdCanonical(w), // contoh "w01"
          waTitle: getWaTitle(w),
        }))
        .filter((w) => w.waCode && w.waTitle);

      if (!waList.length) throw new Error("Tiada WA ditemui untuk CU ini (CPC).");

      const r = await fetch(`${API_BASE}/api/cp/draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          cuCode,
          cuTitle,
          waList,
          ai: {
            wsMin: 3,
            pcPerWs: 1,
            pcStyle: "past_tense_ms",
            language: "MS",
            measurable: true,
          },
        }),
      });

      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || "Gagal jana WS/PC (AI Assisted).");

      // ✅ normalize guna response sebenar (fungsi ini sendiri akan ambil cpDraft jika ada)
      const normalized = normalizeDraftFromApi(j, cu);

      const payloadToStore = {
        sessionId,
        cuCode,
        cuTitle,
        ...normalized,
        generatedAt: (j?.cpDraft || j?.draft || j?.cp)?.generatedAt || new Date().toISOString(),
      };

      // cache state
      setDraftCache((prev) => ({ ...prev, [cuCode]: payloadToStore }));

      // sessionStorage
      try {
        sessionStorage.setItem(`cpDraft:${sessionId}:${cuCode}`, JSON.stringify(payloadToStore));
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
    window.location.href = `/#/cp-editor?session=${encodeURIComponent(sessionId)}&cu=${encodeURIComponent(cuCode)}`;
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
    <div style={{ padding: 16, fontFamily: "Arial, sans-serif" }}>
      <style>{`
        .topbar{ display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin:10px 0 14px; }
        .btn{ border:1px solid #222; background:#f5f5f5; padding:6px 10px; border-radius:6px; cursor:pointer; }
        .btn:hover{ background:#eee; }
        .btn:disabled{ opacity:.6; cursor:not-allowed; }
        .card{ border:1px solid #ddd; border-radius:10px; padding:12px; margin-bottom:14px; max-width: 980px; background:#fff; }
        .cuHeader{ display:flex; justify-content:space-between; gap:10px; align-items:flex-start; }
        .cuTitle{ font-weight:700; font-size:16px; }
        .muted{ font-size:12px; opacity:.75; margin-top:4px; }
        .tableWrap{ margin-top:10px; overflow:auto; }
        table.cp{ width:100%; border-collapse:collapse; min-width: 860px; }
        table.cp th, table.cp td{ border:1px solid #222; padding:10px; vertical-align:top; }
        table.cp th{ background:#dedede; text-align:center; font-weight:700; }
        .waCell{ width:32%; }
        .wsCell{ width:34%; }
        .pcCell{ width:34%; }
        .li{ margin:0; padding-left:18px; }
        .li li{ margin:0 0 4px 0; }
        .warn{ border:1px solid #f5c2c7; background:#f8d7da; color:#842029; padding:10px; border-radius:10px; max-width: 980px; margin-bottom:12px; font-size:13px;}
        .err{ color:crimson; margin-top:10px; }

        @media print{
          .topbar, .noPrint { display:none !important; }
          @page { size: A4 landscape; margin: 10mm; }
          table.cp { min-width: unset; }
          .card{ border:none; padding:0; }
        }
      `}</style>

      <h2>CP Dashboard</h2>

      <div className="topbar noPrint">
        <button className="btn" onClick={goCluster} disabled={!sessionId}>← Ke Cluster</button>
        <button className="btn" onClick={goCpc} disabled={!sessionId}>Lihat CPC</button>
        <button className="btn" onClick={() => window.print()} disabled={!sessionId}>Print (CP Table)</button>
      </div>

      <div style={{ marginBottom: 8 }}>
        <b>Session:</b> {sessionId || <i>(tiada)</i>}
      </div>

      <div style={{ marginBottom: 8 }}>
        <b>Bahasa CPC:</b> {language}
      </div>

      {!sessionId && (
        <div className="err">
          Sila buka dengan URL:
          <div style={{ marginTop: 6 }}>
            <code>/#/cp-dashboard?session=Office-v3</code>
          </div>
        </div>
      )}

      {err && <div className="err">{err}</div>}

      {sessionId && (loading || (!cpc && !err)) && <div style={{ marginTop: 12 }}>Loading CPC...</div>}

      {cpc && !cuListRaw?.length && (
        <div className="err">
          CPC berjaya dimuat (200 OK) tetapi senarai CU tidak ditemui dalam struktur data.
          <div style={{ fontSize: 13, opacity: 0.85, marginTop: 6 }}>
            Semak response <code>/api/cpc/{`{sessionId}`}</code> — pastikan CU berada dalam <code>cus</code>.
          </div>
        </div>
      )}

      {cpc && !!cuListRaw?.length && (
        <div style={{ marginTop: 12 }}>
          <h3 style={{ margin: "12px 0" }}>Senarai CU (diambil terus dari CPC)</h3>

          {hasInvalidCu && (
            <div className="warn">
              Ada CU yang <b>tiada</b> <code>cuCode</code>/<code>cuId</code> dalam CPC. Sistem <b>tidak</b> akan auto-generate ID.
            </div>
          )}

          {cuList.map((item, idx) => {
            const cuCodeCanon = item.cuCodeCanon; // contoh: "c01"
            const cuTitle = item.cuTitle;
            const waList = item.waList || [];
            const isInvalid = !cuCodeCanon;
            const cuDisplay = displayCode(cuCodeCanon) || `(CU#${idx + 1} tiada ID)`;

            const draft = cuCodeCanon ? draftCache[cuCodeCanon] : null;

            const waItemsForTable = (() => {
              if (draft?.waItems?.length) return draft.waItems;

              // fallback dari CPC
              return waList.map((wa, wi) => ({
                waCode: getWaIdCanonical(wa) || `w${pad2(wi + 1)}`,
                waTitle: getWaTitle(wa) || `WA ${wi + 1}`,
                ws: [],
              }));
            })();

            return (
              <div className="card" key={cuCodeCanon || `cu-${idx}`}>
                <div className="cuHeader">
                  <div style={{ flex: 1 }}>
                    <div className="cuTitle">
                      {cuDisplay}: {cuTitle || <span style={{ opacity: 0.7 }}>(tiada tajuk)</span>}
                    </div>

                    <div className="muted">
                      <b>CU Code (CPC):</b>{" "}
                      {cuCodeCanon ? <code>{cuCodeCanon}</code> : <span style={{ color: "crimson" }}>tiada</span>}
                      {"  "} | {" "}
                      <b>WA dalam CPC:</b> {waList.length}
                      {draft?.generatedAt ? (
                        <>
                          {" "} | <b>Draft:</b> <span>✅ Ada</span>{" "}
                          <span style={{ opacity: 0.8 }}>
                            ({new Date(draft.generatedAt).toLocaleString("ms-MY")})
                          </span>
                        </>
                      ) : (
                        <>
                          {" "} | <b>Draft:</b> <span>❌ Belum</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <button
                      className="btn"
                      disabled={isInvalid}
                      onClick={() => goEdit(cuCodeCanon)}
                      title={isInvalid ? "CU tiada cuCode/cuId dalam CPC" : ""}
                    >
                      Edit CP
                    </button>

                    <button
                      className="btn"
                      disabled={isInvalid || busyCu === cuCodeCanon}
                      onClick={() => generateWsPcForCu(cuCodeCanon)}
                      title={isInvalid ? "CU tiada cuCode/cuId dalam CPC" : ""}
                    >
                      {busyCu === cuCodeCanon ? "Generating..." : "AI Generate WS/PC"}
                    </button>
                  </div>
                </div>

                <div className="tableWrap">
                  <table className="cp">
                    <thead>
                      <tr>
                        <th className="waCell">WORK ACTIVITIES (WA)</th>
                        <th className="wsCell">WORK STEP (WS)</th>
                        <th className="pcCell">PERFORMANCE CRITERIA (PC)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {waItemsForTable.map((w, wi) => {
                        const waNo = wi + 1;
                        const waTitle = safeStr(w?.waTitle);
                        const wsArr = Array.isArray(w?.ws) ? w.ws : [];

                        // Placeholder bila backend belum supply WS/PC
                        const wsToShow = wsArr.length
                          ? wsArr
                          : [
                              { wsCode: `${waNo}.1`, wsTitle: "xxx", pc: "xxx" },
                              { wsCode: `${waNo}.2`, wsTitle: "xxx", pc: "xxx" },
                              { wsCode: `${waNo}.3`, wsTitle: "xxx", pc: "xxx" },
                            ];

                        return (
                          <tr key={`${cuCodeCanon || idx}-wa-${wi}`}>
                            <td className="waCell">
                              <div style={{ fontWeight: 700 }}>
                                {waNo}. {waTitle || "(tiada tajuk)"}
                              </div>
                              <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>
                                WA Code: <code>{safeStr(w?.waCode)}</code>
                              </div>
                            </td>

                            <td className="wsCell">
                              <ul className="li">
                                {wsToShow.map((s, si) => (
                                  <li key={`ws-${wi}-${si}`}>
                                    <b>{safeStr(s.wsCode) || `${waNo}.${si + 1}`}</b>{" "}
                                    {safeStr(s.wsTitle) || "xxx"}
                                  </li>
                                ))}
                              </ul>
                            </td>

                            <td className="pcCell">
                              <ul className="li">
                                {wsToShow.map((s, si) => (
                                  <li key={`pc-${wi}-${si}`}>
                                    <b>{safeStr(s.wsCode) || `${waNo}.${si + 1}`}</b>{" "}
                                    {safeStr(s.pc) || "xxx"}
                                  </li>
                                ))}
                              </ul>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>
                  *Nota AI Assisted: WA & CU dikunci ikut CPC. AI jana minimum 3 WS/WA, dan 1 PC/WS (ayat “telah …” yang boleh diukur).
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
