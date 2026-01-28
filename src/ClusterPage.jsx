import React, { useEffect, useMemo, useState } from "react";
console.log("ClusterPage.jsx LOADED ✅ v2026-01-27-RESTORE-ORIGINAL-P1");

const API_BASE =
  (import.meta?.env?.VITE_API_BASE && String(import.meta.env.VITE_API_BASE)) ||
  "https://dacum-backend.onrender.com";

/** Build map: cardId -> text */
function buildCardMap(sessionCards = []) {
  const map = new Map();
  (Array.isArray(sessionCards) ? sessionCards : []).forEach((c) => {
    const id = String(c?.id ?? c?.cardId ?? "");
    if (!id) return;
    const text = String(c?.text ?? c?.card ?? c?.title ?? c?.activity ?? "").trim();
    map.set(id, text);
  });
  return map;
}

/** Extract cards list from any backend shape */
function extractSessionCards(any) {
  return any?.cards ?? any?.sessionCards ?? any?.items ?? any?.data ?? any?.result ?? [];
}

/** Normalize cluster result into {id,title,items:[{id,text}]} */
function normalizeClustersWithCardMap(raw, cardMap) {
  if (!raw) return [];
  const clusters = raw?.clusters ?? raw?.result?.clusters ?? raw?.data?.clusters ?? [];
  if (!Array.isArray(clusters)) return [];

  return clusters.map((c, idx) => {
    const title = String(c?.title ?? c?.name ?? c?.label ?? `Cluster ${idx + 1}`).trim();

    // backend returns cardIds
    const cardIds = c?.cardIds ?? c?.ids ?? c?.members ?? [];
    const arr = Array.isArray(cardIds) ? cardIds : [];

    const items = arr
      .map((cid, j) => {
        const id = String(cid);
        const text = (cardMap && cardMap.get(id)) || "";
        return {
          id: id || `${idx}-${j}`,
          text: text || `(Kad ${id})`,
        };
      })
      .filter((it) => String(it.id || "").trim());

    return { id: String(c?.id ?? `c${idx + 1}`), title, items };
  });
}

/** Normalize CU/WA output from session.cus shape */
function normalizeCusFromSession(any, sidFallback = "") {
  if (!any) return { ok: false, sessionId: sidFallback, appliedAt: "", cus: [] };

  const root = any?.data ?? any?.result ?? any;

  const sessionId = String(
    root?.sessionId ?? root?.sid ?? any?.sessionId ?? any?.sid ?? sidFallback ?? ""
  ).trim();

  const appliedAt = String(root?.appliedAt ?? root?.mergedAt ?? root?.generatedAt ?? "").trim();

  // server.js stores at: session.cus
  const cusRaw = root?.cus ?? root?.items ?? root?.list ?? [];
  const cusArr = Array.isArray(cusRaw) ? cusRaw : [];

  const cus = cusArr.map((cu, i) => {
    const cuTitle = String(cu?.cuTitle ?? cu?.title ?? cu?.name ?? `CU ${i + 1}`).trim();
    const cuNo = String(cu?.cuNo ?? cu?.no ?? cu?.index ?? i + 1).trim();

    const waRaw = cu?.was ?? cu?.wa ?? cu?.workActivities ?? cu?.activities ?? [];
    const waArr = Array.isArray(waRaw) ? waRaw : [];

    const was = waArr.map((wa, j) => {
      const waTitle = String(wa?.waTitle ?? wa?.title ?? wa?.name ?? `WA ${j + 1}`).trim();
      const waNo = String(wa?.waNo ?? wa?.no ?? wa?.index ?? j + 1).trim();
      return { waNo, waTitle };
    });

    return { cuNo, cuTitle, was };
  });

  return { ok: cus.length > 0, sessionId, appliedAt, cus };
}

function normalizeMySpikeCompare(any) {
  if (!any) return { ok: false, rows: [], summary: "" };

  const root = any?.data ?? any?.result ?? any;

  const rowsRaw =
    root?.rows ??
    root?.items ??
    root?.comparisons ??
    root?.list ??
    root?.results ??
    root?.output ??
    root?.data ??
    [];

  const rowsArr = Array.isArray(rowsRaw) ? rowsRaw : [];

  const rows = rowsArr.map((r) => {
    const cuTitle = String(
      r?.cuTitle ??
        r?.cu ??
        r?.iNossCU ??
        r?.iNossCu ??
        r?.sourceCu ??
        r?.dacumCU ??
        r?.title ??
        ""
    ).trim();

    const status = String(r?.status ?? r?.matchStatus ?? "").trim() || "TIADA";

    const bestScore = Number(
      r?.bestScore ??
        r?.score ??
        r?.similarity ??
        r?.best ??
        0
    ) || 0;

    const topMySpikeMatch = String(
      r?.topMySpikeMatch ??
        r?.topMatch ??
        r?.top ??
        r?.match ??
        r?.myspike ??
        r?.myspikeMatch ??
        r?.topMySpike ??
        ""
    ).trim();

    return { cuTitle, status, bestScore, topMySpikeMatch };
  });

  const indexCount = root?.myspikeIndex ?? root?.indexCount ?? root?.totalIndex;
  const ada = root?.ada ?? root?.found ?? root?.matchCount;
  const tiada = root?.tiada ?? root?.notFound ?? root?.missCount;

  const summaryParts = [];
  if (typeof indexCount !== "undefined") summaryParts.push(`MySPIKE Index: ${indexCount}`);
  if (typeof ada !== "undefined") summaryParts.push(`ADA: ${ada}`);
  if (typeof tiada !== "undefined") summaryParts.push(`TIADA: ${tiada}`);

  const summary = summaryParts.join(" | ");

  return { ok: rows.length > 0, rows, summary };
}

export default function ClusterPage({ initialSessionId = "Masjid", onBack }) {
  const apiBase = useMemo(() => {
    const v = String(API_BASE || "").trim();
    return v ? v.replace(/\/+$/, "") : "https://dacum-backend.onrender.com";
  }, []);

  const [sessionId, setSessionId] = useState(initialSessionId);

  // cluster result
  const [rawResult, setRawResult] = useState(null);
  const [clusters, setClusters] = useState([]); // editable UI
  const [agreed, setAgreed] = useState(false);

  // CU/WA output (hasil Apply / session.cus)
  const [applyInfo, setApplyInfo] = useState(null); // {ok, sessionId, appliedAt, cus}
  const [applyMsg, setApplyMsg] = useState("");
  const [cuwaErr, setCuwaErr] = useState("");

  // MySPIKE compare
  const [compareInfo, setCompareInfo] = useState(null); // {ok, rows, summary}
  const [compareMsg, setCompareMsg] = useState("");
  const [compareErr, setCompareErr] = useState("");
  const [compareLoading, setCompareLoading] = useState(false);
  const [indexLoading, setIndexLoading] = useState(false);
  const [indexMsg, setIndexMsg] = useState("");

  // loading/error
  const [busy, setBusy] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [err, setErr] = useState("");

  // bila session berubah -> reset state
  useEffect(() => {
    setRawResult(null);
    setClusters([]);
    setAgreed(false);
    setErr("");
    setApplyInfo(null);
    setApplyMsg("");
    setCuwaErr("");
    setCompareInfo(null);
    setCompareMsg("");
    setCompareErr("");
  }, [sessionId]);

  async function apiGet(path) {
    const res = await fetch(`${apiBase}${path}`);
    const text = await res.text().catch(() => "");
    let json = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = { raw: text };
    }
    if (!res.ok) throw new Error(json?.error || `GET ${path} -> ${res.status}`);
    return json;
  }

  async function apiPost(path, body) {
    const res = await fetch(`${apiBase}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    });
    const text = await res.text().catch(() => "");
    let json = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = { raw: text };
    }
    if (!res.ok) throw new Error(json?.error || `POST ${path} -> ${res.status}`);
    return json;
  }

  /** Try get session cards (to resolve cardIds -> text) */
  async function loadSessionCards(sid) {
    const tries = [
      `/api/session/cards/${encodeURIComponent(sid)}`,
      `/api/session/${encodeURIComponent(sid)}/cards`,
      `/api/cards/${encodeURIComponent(sid)}`,
      `/api/session/items/${encodeURIComponent(sid)}`,
    ];

    let last = "";
    for (const p of tries) {
      try {
        console.log("LOAD CARDS TRY:", p);
        const out = await apiGet(p);
        console.log("LOAD CARDS OK:", p, out);
        const cards = extractSessionCards(out);
        return Array.isArray(cards) ? cards : [];
      } catch (e) {
        last = String(e?.message || e);
        console.warn("LOAD CARDS FAIL:", p, last);
      }
    }
    console.warn("LOAD CARDS fallback EMPTY:", last);
    return [];
  }

  async function loadResult() {
    const sid = String(sessionId || "").trim();
    if (!sid) return;

    setErr("");

    try {
      const path = `/api/cluster/result/${encodeURIComponent(sid)}`;
      console.log("LOAD RESULT:", path);
      const out = await apiGet(path);
      console.log("LOAD RESULT OK:", out);

      setClusterResult(out);
      return;
    } catch (e) {
      console.warn("NO CLUSTER RESULT YET:", e?.message || e);
      // BUKAN error — ini state biasa
      setClusterResult(null);
    }
  }

      if (!out) throw new Error(last || "Gagal load cluster result (tiada endpoint serasi).");

      const cards = await loadSessionCards(sid);
      const cardMap = buildCardMap(cards);
      const normalized = normalizeClustersWithCardMap(out, cardMap);

      setRawResult(out);
      setClusters(normalized);
      setAgreed(false);
    } catch (e) {
      setErr(String(e?.message || e));
    }
  }

  async function runClustering() {
    const sid = String(sessionId || "").trim();
    if (!sid) return alert("Sila isi Session dulu.");

    setBusy(true);
    setAiLoading(true);
    setErr("");

    const tries = [
      { path: `/api/cluster/run/${encodeURIComponent(sid)}`, body: {} },
      { path: `/api/cluster/run`, body: { sessionId: sid } },
      { path: `/api/cluster/run`, body: { sid } },
      { path: `/api/cluster/run?session=${encodeURIComponent(sid)}`, body: {} },
    ];

    let lastErr = "";

    try {
      for (const t of tries) {
        try {
          console.log("RUN TRY:", t.path, t.body);
          await apiPost(t.path, t.body);
          console.log("RUN OK:", t.path);
          await loadResult();
          return;
        } catch (e) {
          lastErr = String(e?.message || e);
          console.warn("RUN FAIL:", t.path, lastErr);
        }
      }
      throw new Error(lastErr || "Run AI (Clustering) gagal: semua endpoint tidak serasi.");
    } catch (e) {
      setErr(String(e?.message || e));
      alert(String(e?.message || e));
    } finally {
      setBusy(false);
      setAiLoading(false);
    }
  }

  /** Load CU/WA output from server.js (session.cus) */
  async function loadCuWaOutput(sid) {
    const s = String(sid || "").trim();
    if (!s) return;

    setCuwaErr("");
    setApplyInfo(null);
    setApplyMsg("");

    // ✅ PRIORITY (server.js real endpoints)
    const tries = [
      `/api/session/cus/${encodeURIComponent(s)}`,
      `/api/session/cus?sessionId=${encodeURIComponent(s)}`,

      // fallback legacy guesses (keep harmless)
      `/api/cluster/applied/${encodeURIComponent(s)}`,
      `/api/cluster/applied?sessionId=${encodeURIComponent(s)}`,
      `/api/cluster/cus/${encodeURIComponent(s)}`,
      `/api/cus/${encodeURIComponent(s)}`,
    ];

    let out = null;
    let last = "";

    for (const p of tries) {
      try {
        console.log("LOAD CUWA TRY:", p);
        out = await apiGet(p);
        console.log("LOAD CUWA OK:", p, out);
        break;
      } catch (e) {
        last = String(e?.message || e);
        console.warn("LOAD CUWA FAIL:", p, last);
      }
    }

    if (!out) {
      setCuwaErr(last || "Tiada output CU/WA (endpoint tidak jumpa / data belum disimpan).");
      return;
    }

    const normalized = normalizeCusFromSession(out, s);

    if (!normalized.ok) {
      setCuwaErr("Output CU/WA kosong (session.cus belum wujud / tiada data).");
      setApplyInfo(normalized);
      return;
    }

    setApplyInfo(normalized);
    const at = normalized.appliedAt ? ` | appliedAt ${normalized.appliedAt}` : "";
    setApplyMsg(`CU/WA OK: sessionId ${normalized.sessionId || s} | cusCount ${normalized.cus.length}${at}`);
  }

  async function applyMerge() {
    const sid = String(sessionId || "").trim();
    if (!sid) return alert("Sila isi Session dulu.");

    if (!agreed) return alert("Sila tekan 'Agreed' dahulu selepas anda selesai edit clustering.");

    setBusy(true);
    setErr("");
    setCuwaErr("");
    setApplyInfo(null);
    setApplyMsg("");

    try {
      // ✅ PILIHAN 1: server.js kekal — apply hanya perlukan sessionId
      // (edit clusters di UI tidak digunakan oleh backend dalam fasa ini)
      const tries = [
        { path: `/api/cluster/apply/${encodeURIComponent(sid)}`, body: {} },
        { path: `/api/cluster/apply`, body: { sessionId: sid } },
        { path: `/api/cluster/apply`, body: { sid } },
        { path: `/api/cluster/apply?session=${encodeURIComponent(sid)}`, body: {} },
      ];

      let out = null;
      let lastErr = "";

      for (const t of tries) {
        try {
          console.log("APPLY TRY:", t.path, t.body);
          out = await apiPost(t.path, t.body);
          console.log("APPLY OK:", t.path, out);
          break;
        } catch (e) {
          lastErr = String(e?.message || e);
          console.warn("APPLY FAIL:", t.path, lastErr);
        }
      }

      if (!out) throw new Error(lastErr || "Apply AI (Merge) gagal: semua endpoint tidak serasi.");

      alert("Apply AI (Merge) berjaya. Output CU/WA akan dipaparkan di bawah.");

      // ✅ ambil CU/WA dari endpoint rasmi server.js
      await loadCuWaOutput(sid);

      // optional refresh cluster result (UI)
      await loadResult();
    } catch (e) {
      setErr(String(e?.message || e));
      alert(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  async function buildMySpikeIndex() {
    setIndexMsg("");
    setCompareErr("");
    setIndexLoading(true);
    try {
      const out = await apiPost(`/api/myspike/index/build`, {});
      setIndexMsg("MySPIKE index berjaya dibina.");
      // optional: terus run compare lepas build
      // await runMySpikeComparison();
      console.log("INDEX BUILD OK:", out);
    } catch (e) {
      setIndexMsg(`Gagal bina index: ${String(e?.message || e)}`);
    } finally {
      setIndexLoading(false);
    }
  }
  
  async function runMySpikeComparison() {
    const sid = String(sessionId || "").trim();
    if (!sid) return alert("Sila isi Session dulu.");

    setCompareErr("");
    setCompareMsg("");
    setCompareInfo(null);
    setCompareLoading(true);

    try {
      // pastikan kita ada CU list (kalau belum apply, kita cuba load dari session.cus)
      let cusPayload = applyInfo?.ok ? applyInfo.cus : null;
      if (!cusPayload) {
        // cuba load CU/WA dahulu dari server
        const tmp = await apiGet(`/api/session/cus/${encodeURIComponent(sid)}`);
        const norm = normalizeCusFromSession(tmp, sid);
        if (norm.ok) cusPayload = norm.cus;
      }

      const body = {
        sessionId: sid,
        cus: cusPayload || [],
      };

      // endpoint rasmi dalam server.js (MySPIKE Comparator)
      const out = await apiPost(`/api/s2/compare`, body);
      const norm = normalizeMySpikeCompare(out);
      if (norm?.rows?.length && Array.isArray(cusPayload)) {
        norm.rows = norm.rows.map((r, i) => {
          const fallbackCu = String(cusPayload?.[i]?.cuTitle || "").trim();
          return {
            ...r,
            cuTitle: String(r?.cuTitle || "").trim() || fallbackCu,
          };
        });
      }

      if (!norm.ok) {
        throw new Error("Response MySPIKE tidak mengandungi senarai perbandingan untuk dipaparkan.");
      }

      setCompareInfo(norm);
      setCompareMsg(norm.summary || `MySPIKE Comparison OK (${norm.rows.length} rows)`);
    } catch (e) {
      setCompareErr(String(e?.message || e));
    } finally {
      setCompareLoading(false);
    }
  }

  // ====== EDIT ACTIONS (UI only for now) ======
  function renameCluster(clusterId, newTitle) {
    setClusters((prev) => prev.map((c) => (c.id === clusterId ? { ...c, title: newTitle } : c)));
    setAgreed(false);
  }

  function addCluster() {
    setClusters((prev) => [...prev, { id: `c${Date.now()}`, title: "Cluster Baharu", items: [] }]);
    setAgreed(false);
  }

  function moveItem(itemId, fromClusterId, toClusterId) {
    if (fromClusterId === toClusterId) return;

    setClusters((prev) => {
      const next = prev.map((c) => ({ ...c, items: [...(c.items || [])] }));
      const from = next.find((c) => c.id === fromClusterId);
      const to = next.find((c) => c.id === toClusterId);
      if (!from || !to) return prev;

      const idx = (from.items || []).findIndex((x) => x.id === itemId);
      if (idx === -1) return prev;

      const [picked] = from.items.splice(idx, 1);
      to.items.push(picked);
      return next;
    });

    setAgreed(false);
  }

  function removeEmptyCluster(clusterId) {
    setClusters((prev) => prev.filter((c) => c.id !== clusterId));
    setAgreed(false);
  }

  function doAgreed() {
    if (!clusters.length) {
      alert("Tiada clustering untuk di-Agreed. Sila Run AI (Clustering) dahulu.");
      return;
    }
    const hasEmptyTitle = clusters.some((c) => !String(c.title || "").trim());
    if (hasEmptyTitle) {
      alert("Sila pastikan semua tajuk cluster diisi sebelum Agreed.");
      return;
    }
    setAgreed(true);
  }

  // load last result on mount
  useEffect(() => {
    loadResult();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ====== UI ======
  return (
    <div style={{ padding: 18, maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
        <h1 style={{ marginTop: 0 }}>Cluster Page</h1>
        {onBack ? (
          <button onClick={onBack} style={{ height: 36 }}>
            Back
          </button>
        ) : null}
      </div>

      {/* ACTION BAR */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <input
          value={sessionId}
          onChange={(e) => setSessionId(e.target.value)}
          style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #ccc" }}
        />

        <button onClick={runClustering} disabled={busy || aiLoading} style={{ height: 36 }}>
          {aiLoading ? "NOSS AI Loading..." : "Run AI (Clustering)"}
        </button>

        <button onClick={loadResult} disabled={busy} style={{ height: 36 }}>
          Reload Result
        </button>

        <button
          onClick={applyMerge}
          disabled={busy || !agreed}
          title={!agreed ? "Sila Agreed dahulu" : "Proceed Merge"}
          style={{ height: 36 }}
        >
          Apply AI (Merge)
        </button>

        <button
          onClick={() => loadCuWaOutput(String(sessionId || "").trim())}
          disabled={busy}
          style={{ height: 36 }}
          title="Tarik semula output CU/WA dari server (session.cus)"
        >
          Reload CU (cus)
        </button>

        <button
          onClick={buildMySpikeIndex}
          disabled={busy || indexLoading}
          style={{ height: 36 }}
        >
          {indexLoading ? "Building Index..." : "Build MySPIKE Index"}
        </button>
        
        <button
          onClick={runMySpikeComparison}
          disabled={busy || compareLoading}
          style={{ height: 36 }}
          title="Run comparator CU terhadap MySPIKE"
        >
          {compareLoading ? "Comparing..." : "Run AI Comparison (MySPIKE)"}
        </button>
      </div>

      {/* status */}
      <div style={{ marginTop: 10, fontSize: 13, opacity: 0.85 }}>
        Session: <b>{String(sessionId || "")}</b>{" "}
        {agreed ? (
          <span style={{ marginLeft: 10, color: "green", fontWeight: 700 }}>✓ AGREED</span>
        ) : (
          <span style={{ marginLeft: 10, color: "#b45309", fontWeight: 700 }}>✱ BELUM AGREED</span>
        )}
      </div>

      {err ? <div style={{ marginTop: 10, color: "#b91c1c" }}>Error: {err}</div> : null}

      {/* ruang edit sebelum merge */}
      <div style={{ marginTop: 16, padding: 14, border: "1px solid #ddd", borderRadius: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
          <div style={{ fontWeight: 800 }}>Edit Clustering (sebelum Merge)</div>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={addCluster} disabled={busy} style={{ height: 32 }}>
              + Add Cluster
            </button>

            <button
              onClick={doAgreed}
              disabled={busy || !clusters.length}
              style={{
                height: 32,
                fontWeight: 800,
                background: agreed ? "#0f766e" : "#111",
                color: "#fff",
                border: "1px solid #111",
                borderRadius: 10,
                padding: "0 12px",
                cursor: "pointer",
              }}
              title="Lock hasil edit sebelum Merge"
            >
              Agreed
            </button>
          </div>
        </div>

        <div style={{ marginTop: 8, fontSize: 12, opacity: 0.8 }}>
          Anda boleh: <b>ubah tajuk cluster</b> dan <b>pindahkan aktiviti</b>. Selepas selesai,
          tekan <b>Agreed</b> untuk lock sebelum <b>Apply AI (Merge)</b>.
          <div style={{ marginTop: 6, opacity: 0.8 }}>
            <b>Nota (Pilihan 1):</b> Apply akan ikut hasil AI terakhir di server (edit UI belum dipakai oleh backend).
          </div>
        </div>
      </div>

      {/* paparan cluster list */}
      <div style={{ marginTop: 14 }}>
        {clusters.length === 0 ? (
          <div style={{ opacity: 0.8 }}>
            Belum ada hasil clustering. Tekan <b>Run AI (Clustering)</b>.
          </div>
        ) : (
          clusters.map((c) => (
            <div
              key={c.id}
              style={{
                border: "1px solid #ddd",
                borderRadius: 14,
                padding: 14,
                marginBottom: 12,
                background: agreed ? "#fcfcfc" : "#fff",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <input
                    value={c.title}
                    disabled={agreed}
                    onChange={(e) => renameCluster(c.id, e.target.value)}
                    style={{
                      padding: "8px 10px",
                      borderRadius: 10,
                      border: "1px solid #ccc",
                      fontWeight: 800,
                      minWidth: 320,
                      cursor: agreed ? "not-allowed" : "text",
                    }}
                  />
                  <div style={{ opacity: 0.75 }}>
                    — <b>{(c.items || []).length}</b> aktiviti
                  </div>
                </div>

                <button
                  onClick={() => removeEmptyCluster(c.id)}
                  disabled={agreed || (c.items || []).length > 0}
                  title={(c.items || []).length > 0 ? "Hanya boleh buang cluster yang kosong" : "Buang cluster kosong"}
                  style={{ height: 32 }}
                >
                  Remove (empty)
                </button>
              </div>

              <div style={{ marginTop: 10 }}>
                {(c.items || []).map((it) => (
                  <div
                    key={it.id}
                    style={{
                      display: "flex",
                      gap: 10,
                      alignItems: "center",
                      padding: "6px 0",
                      borderBottom: "1px dashed #eee",
                    }}
                  >
                    <div style={{ flex: 1 }}>• {it.text || <i>(tiada teks)</i>}</div>

                    <select
                      disabled={agreed}
                      value={c.id}
                      onChange={(e) => moveItem(it.id, c.id, e.target.value)}
                      style={{
                        padding: "6px 8px",
                        borderRadius: 10,
                        border: "1px solid #ccc",
                        cursor: agreed ? "not-allowed" : "pointer",
                        minWidth: 220,
                      }}
                      title="Pindahkan aktiviti ke cluster lain"
                    >
                      {clusters.map((opt) => (
                        <option key={opt.id} value={opt.id}>
                          Move to: {opt.title}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}

                {(c.items || []).length === 0 ? (
                  <div style={{ marginTop: 8, opacity: 0.75 }}>(Cluster kosong)</div>
                ) : null}
              </div>
            </div>
          ))
        )}
      </div>

      {/* ===== MySPIKE Comparison ===== */}
      <div style={{ marginTop: 18, paddingTop: 10, borderTop: "2px solid #eee" }}>
        <h2 style={{ margin: "8px 0" }}>MySPIKE Comparison</h2>

        {compareMsg ? (
          <div
            style={{
              background: "#eff6ff",
              border: "1px solid #bfdbfe",
              padding: "10px 12px",
              borderRadius: 10,
              marginBottom: 12,
              fontSize: 13,
            }}
          >
            <b>{compareMsg}</b>
          </div>
        ) : null}

        {compareErr ? <div style={{ color: "#b91c1c", marginBottom: 10 }}>Error: {compareErr}</div> : null}

        {!compareInfo?.ok ? (
          <div style={{ opacity: 0.8 }}>
            Tiada comparison lagi. Klik <b>Run AI Comparison (MySPIKE)</b>.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                  <tr>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>CU (iNOSS)</th>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>Status</th>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>Best Score</th>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>Top MySPIKE Match</th>
                </tr>
              </thead>
              <tbody>
                {compareInfo.rows.map((r, i) => (
                  <tr key={i}>
                    <td style={{ borderBottom: "1px solid #f0f0f0", padding: 8 }}>{r.cuTitle || "-"}</td>
                    <td style={{ borderBottom: "1px solid #f0f0f0", padding: 8 }}>{r.status || "-"}</td>
                    <td style={{ borderBottom: "1px solid #f0f0f0", padding: 8 }}>{Number(r.bestScore || 0).toFixed(4)}</td>
                    <td style={{ borderBottom: "1px solid #f0f0f0", padding: 8 }}>
                      {r.topCode ? `${r.topCode} — ${r.topTitle}` : (r.topTitle || "-")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ===== CU/WA output (hasil Apply) ===== */}
      <div style={{ marginTop: 18, paddingTop: 10, borderTop: "2px solid #eee" }}>
        <h2 style={{ margin: "8px 0" }}>CU/WA (hasil Apply)</h2>

        {applyMsg ? (
          <div
            style={{
              background: "#ecfdf5",
              border: "1px solid #bbf7d0",
              padding: "10px 12px",
              borderRadius: 10,
              marginBottom: 12,
              fontSize: 13,
            }}
          >
            <b>{applyMsg}</b>
          </div>
        ) : null}

        {cuwaErr ? <div style={{ color: "#b91c1c", marginBottom: 10 }}>Error: {cuwaErr}</div> : null}

        {!applyInfo?.ok ? (
          <div style={{ opacity: 0.8 }}>
            Tiada output CU/WA. Klik <b>Apply AI (Merge)</b> atau <b>Reload CU (cus)</b>.
          </div>
        ) : (
          <div>
            {(applyInfo.cus || []).map((cu, idx) => {
              const cuNo = String(cu?.cuNo ?? idx + 1).padStart(2, "0");
              return (
                <div
                  key={`${cuNo}-${idx}`}
                  style={{
                    border: "1px solid #ddd",
                    borderRadius: 14,
                    padding: 14,
                    marginBottom: 12,
                    background: "#fff",
                  }}
                >
                  <div style={{ fontWeight: 900, marginBottom: 6 }}>
                    CU-{cuNo}: {cu.cuTitle}
                  </div>

                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {(cu.was || []).map((wa, j) => {
                      const waNo = String(wa?.waNo ?? j + 1).padStart(2, "0");
                      return (
                        <li key={`${cuNo}-${waNo}-${j}`} style={{ margin: "2px 0" }}>
                          <b>WA-{waNo}:</b> {wa.waTitle}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        )}

        {rawResult?.generatedAt ? (
          <div style={{ marginTop: 10, fontSize: 12, opacity: 0.75 }}>
            cluster generatedAt: {String(rawResult.generatedAt)}
          </div>
        ) : null}
      </div>
    </div>
  );
}
