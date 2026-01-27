import React, { useEffect, useMemo, useState } from "react";
console.log("ClusterPage.jsx LOADED ✅ v2026-01-27-CLUSTER-APPLY-SHOW-CUWA-1");

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

/**
 * Normalize Applied CU/WA (hasil Apply) daripada mana-mana bentuk backend:
 * Harap output akhir jadi:
 * {
 *  sessionId, appliedAt,
 *  cus: [{ cuNo, cuTitle, was: [{ waNo, waTitle }] }]
 * }
 */
function normalizeApplied(any) {
  if (!any) return null;

  const root = any?.result ?? any?.data ?? any;

  const sessionId = String(root?.sessionId ?? root?.sid ?? root?.session ?? "").trim();
  const appliedAt = root?.appliedAt ?? root?.applied_at ?? root?.generatedAt ?? root?.generated_at ?? null;

  const cusRaw =
    root?.cus ??
    root?.CUs ??
    root?.cuList ??
    root?.competencyUnits ??
    root?.appliedCus ??
    root?.applyResult?.cus ??
    root?.result?.cus ??
    root?.data?.cus ??
    [];

  const cusArr = Array.isArray(cusRaw) ? cusRaw : [];

  const cus = cusArr.map((cu, i) => {
    const cuNo =
      String(cu?.cuNo ?? cu?.no ?? cu?.cu_no ?? cu?.code ?? `CU-${String(i + 1).padStart(2, "0")}`);
    const cuTitle = String(cu?.cuTitle ?? cu?.title ?? cu?.name ?? "").trim() || `(CU ${i + 1})`;

    const wasRaw = cu?.was ?? cu?.WA ?? cu?.waList ?? cu?.workActivities ?? cu?.activities ?? [];
    const wasArr = Array.isArray(wasRaw) ? wasRaw : [];

    const was = wasArr.map((wa, j) => {
      const waNo =
        String(wa?.waNo ?? wa?.no ?? wa?.wa_no ?? wa?.code ?? `WA-${String(j + 1).padStart(2, "0")}`);
      const waTitle = String(wa?.waTitle ?? wa?.title ?? wa?.name ?? wa?.text ?? "").trim() || `(WA ${j + 1})`;
      return { waNo, waTitle };
    });

    return { cuNo, cuTitle, was };
  });

  // kalau tiada sessionId di payload, fallback: null (akan dipaparkan dari state sessionId)
  return { sessionId, appliedAt, cus };
}

export default function ClusterPage({ initialSessionId = "Masjid", onBack }) {
  const apiBase = useMemo(() => {
    const v = String(API_BASE || "").trim();
    return v ? v.replace(/\/+$/, "") : "https://dacum-backend.onrender.com";
  }, []);

  const [sessionId, setSessionId] = useState(initialSessionId);

  // data asal dari backend (untuk reference)
  const [rawResult, setRawResult] = useState(null);

  // data boleh edit (in-memory)
  const [clusters, setClusters] = useState([]); // editable

  // applied CU/WA output
  const [applyInfo, setApplyInfo] = useState(null); // normalized applied output
  const [applyBanner, setApplyBanner] = useState(""); // "Apply OK ..."

  // gating
  const [agreed, setAgreed] = useState(false);

  // loading/error
  const [busy, setBusy] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [err, setErr] = useState("");

  // bila session berubah -> reset state
  useEffect(() => {
    setRawResult(null);
    setClusters([]);
    setAgreed(false);
    setApplyInfo(null);
    setApplyBanner("");
    setErr("");
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

    const tries = [
      `/api/cluster/result/${encodeURIComponent(sid)}`,
      `/api/cluster/result?session=${encodeURIComponent(sid)}`,
      `/api/cluster/result?sessionId=${encodeURIComponent(sid)}`,
      `/api/cluster/result?sid=${encodeURIComponent(sid)}`,
    ];

    let out = null;
    let last = "";

    try {
      for (const path of tries) {
        try {
          console.log("LOAD RESULT TRY:", path);
          out = await apiGet(path);
          console.log("LOAD RESULT OK:", path, out);
          break;
        } catch (e) {
          last = String(e?.message || e);
          console.warn("LOAD RESULT FAIL:", path, last);
        }
      }

      if (!out) throw new Error(last || "Gagal load cluster result (tiada endpoint serasi).");

      // resolve cardId -> text
      const cards = await loadSessionCards(sid);
      const cardMap = buildCardMap(cards);
      const normalized = normalizeClustersWithCardMap(out, cardMap);

      setRawResult(out);
      setClusters(normalized);
      setAgreed(false); // result baru => perlu agreed semula
    } catch (e) {
      setErr(String(e?.message || e));
    }
  }

  /**
   * Load CU/WA (hasil Apply)
   * Ini penting untuk paparan macam Office-v3.
   */
  async function loadApplied() {
    const sid = String(sessionId || "").trim();
    if (!sid) return;

    setErr("");

    // Endpoint anda mungkin berbeza. Kita cuba beberapa corak.
    const tries = [
      `/api/cluster/applied/${encodeURIComponent(sid)}`,
      `/api/cluster/applied?session=${encodeURIComponent(sid)}`,
      `/api/cluster/applied?sid=${encodeURIComponent(sid)}`,
      `/api/cluster/apply/result/${encodeURIComponent(sid)}`,
      `/api/cluster/apply/result?session=${encodeURIComponent(sid)}`,
      `/api/cluster/apply/result?sid=${encodeURIComponent(sid)}`,
      // ada backend simpan sebagai "cus"
      `/api/cluster/cus/${encodeURIComponent(sid)}`,
      `/api/cluster/cus?session=${encodeURIComponent(sid)}`,
      `/api/cluster/cus?sid=${encodeURIComponent(sid)}`,
      // fallback: guna /api/cus/:sid jika wujud
      `/api/cus/${encodeURIComponent(sid)}`,
      `/api/cus?session=${encodeURIComponent(sid)}`,
      `/api/cus?sid=${encodeURIComponent(sid)}`,
    ];

    let out = null;
    let last = "";

    try {
      for (const path of tries) {
        try {
          console.log("LOAD APPLIED TRY:", path);
          out = await apiGet(path);
          console.log("LOAD APPLIED OK:", path, out);
          break;
        } catch (e) {
          last = String(e?.message || e);
          console.warn("LOAD APPLIED FAIL:", path, last);
        }
      }

      if (!out) throw new Error(last || "Gagal load CU/WA (hasil Apply). Tiada endpoint serasi.");

      const normalized = normalizeApplied(out);

      // kalau normalized cus kosong, tetap set supaya user nampak “kosong” (debug)
      setApplyInfo(normalized);
      const count = (normalized?.cus || []).length;

      const shownSid = normalized?.sessionId ? normalized.sessionId : sid;
      setApplyBanner(
        `Apply OK: sessionId ${shownSid} | cusCount ${count}` + (normalized?.appliedAt ? ` | appliedAt ${normalized.appliedAt}` : "")
      );
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

    console.log("RUN CLUSTER clicked, sid =", sid);

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
          console.log("TRY:", t.path, t.body);
          await apiPost(t.path, t.body);
          console.log("SUCCESS:", t.path);

          // bila clustering baru, apply output lama tak relevan
          setApplyInfo(null);
          setApplyBanner("");

          await loadResult();
          return;
        } catch (e) {
          lastErr = String(e?.message || e);
          console.warn("FAIL:", t.path, lastErr);
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

  async function applyMerge() {
    const sid = String(sessionId || "").trim();
    if (!sid) return alert("Sila isi Session dulu.");

    if (!agreed) {
      return alert("Sila tekan 'Agreed' dahulu selepas anda selesai edit clustering.");
    }

    setBusy(true);
    setErr("");

    const payload = { clusters, source: "manual_edit_before_merge" };

    const tries = [
      { path: `/api/cluster/apply/${encodeURIComponent(sid)}`, body: payload },
      { path: `/api/cluster/apply`, body: { sessionId: sid, ...payload } },
      { path: `/api/cluster/apply`, body: { sid, ...payload } },
      { path: `/api/cluster/apply?session=${encodeURIComponent(sid)}`, body: payload },
    ];

    let lastErr = "";
    try {
      let out = null;

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

      // ✅ PENTING: JANGAN redirect ke CPC.
      // Lepas apply, kita terus load CU/WA (hasil Apply)
      await loadApplied();

      // optional: kekalkan cluster result pun boleh refresh (tapi ini akan reset agreed=false)
      // Kalau Ts nak kekal agreed hijau, jangan panggil loadResult() di sini.
      // await loadResult();

      // scroll ke output CU/WA
      setTimeout(() => {
        document.getElementById("apply-output")?.scrollIntoView({ behavior: "smooth" });
      }, 50);
    } catch (e) {
      setErr(String(e?.message || e));
      alert(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  // ====== EDIT ACTIONS ======
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
    // cuba juga load applied (kalau ada apply sebelum ini)
    loadApplied();
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

        <button onClick={loadApplied} disabled={busy} style={{ height: 36 }}>
          Reload CU (cus)
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

      {/* ===== Banner Apply OK ===== */}
      {applyBanner ? (
        <div
          style={{
            marginTop: 12,
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid #bbf7d0",
            background: "#f0fdf4",
            color: "#166534",
            fontWeight: 700,
            fontSize: 13,
          }}
        >
          {applyBanner}
        </div>
      ) : null}

      {/* ruang edit sebelum merge */}
      <div
        style={{
          marginTop: 16,
          padding: 14,
          border: "1px solid #ddd",
          borderRadius: 14,
        }}
      >
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
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 10,
                  alignItems: "center",
                }}
              >
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
                      flexWrap: "wrap",
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 280 }}>• {it.text || <i>(tiada teks)</i>}</div>

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

                {(c.items || []).length === 0 ? <div style={{ marginTop: 8, opacity: 0.75 }}>(Cluster kosong)</div> : null}
              </div>
            </div>
          ))
        )}
      </div>

      {/* ===== OUTPUT CU/WA (hasil Apply) ===== */}
      <div id="apply-output" style={{ marginTop: 18 }}>
        <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 10 }}>CU/WA (hasil Apply)</div>

        {!applyInfo ? (
          <div style={{ opacity: 0.75 }}>
            Tiada output CU/WA. Klik <b>Apply AI (Merge)</b> atau <b>Reload CU (cus)</b>.
          </div>
        ) : (applyInfo?.cus || []).length === 0 ? (
          <div style={{ opacity: 0.75 }}>
            Output CU/WA ditemui tetapi <b>cus kosong</b>. Ini biasanya tanda backend belum pulangkan struktur “cus/was”.
            <div style={{ marginTop: 6, fontSize: 12, opacity: 0.75 }}>
              Tip: buka Network → response “applied/cus” untuk lihat key sebenar yang backend pulangkan.
            </div>
          </div>
        ) : (
          <>
            <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 8 }}>
              sessionId: <b>{applyInfo.sessionId || String(sessionId || "")}</b>
              {applyInfo.appliedAt ? (
                <>
                  {" "}
                  | appliedAt: <b>{String(applyInfo.appliedAt)}</b>
                </>
              ) : null}
            </div>

            {(applyInfo.cus || []).map((cu, idx) => (
              <div
                key={`${cu.cuNo}-${idx}`}
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: 14,
                  padding: 14,
                  marginBottom: 12,
                  background: "#fff",
                }}
              >
                <div style={{ fontWeight: 900, marginBottom: 8 }}>
                  {String(cu.cuNo || `CU-${String(idx + 1).padStart(2, "0")}`)}: {cu.cuTitle}
                </div>

                <div style={{ paddingLeft: 14 }}>
                  {(cu.was || []).length ? (
                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                      {(cu.was || []).map((wa, j) => (
                        <li key={`${cu.cuNo}-${wa.waNo}-${j}`} style={{ marginBottom: 4 }}>
                          <b>{String(wa.waNo || `WA-${String(j + 1).padStart(2, "0")}`)}:</b>{" "}
                          {String(wa.waTitle || "")}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div style={{ opacity: 0.75 }}>(Tiada WA)</div>
                  )}
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      {rawResult?.generatedAt ? (
        <div style={{ marginTop: 12, fontSize: 12, opacity: 0.75 }}>
          cluster generatedAt: {String(rawResult.generatedAt)}
        </div>
      ) : null}
    </div>
  );
}
