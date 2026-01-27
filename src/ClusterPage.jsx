import React, { useEffect, useMemo, useState } from "react";
console.log("ClusterPage.jsx LOADED ✅ v2026-01-27-CLUSTER-RESOLVE-CARDIDS-1");

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
  // common shapes
  return (
    any?.cards ??
    any?.sessionCards ??
    any?.items ??
    any?.data ??
    any?.result ??
    []
  );
}

/** Normalize cluster result into {id,title,items:[{id,text}]} */
function normalizeClustersWithCardMap(raw, cardMap) {
  if (!raw) return [];

  const clusters = raw?.clusters ?? raw?.result?.clusters ?? raw?.data?.clusters ?? [];
  if (!Array.isArray(clusters)) return [];

  return clusters.map((c, idx) => {
    const title = String(c?.title ?? c?.name ?? c?.label ?? `Cluster ${idx + 1}`).trim();

    // IMPORTANT: backend returns cardIds (numbers)
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
      // ✅ best guess: session cards endpoint
      `/api/session/cards/${encodeURIComponent(sid)}`,

      // alternatives (if you implemented differently)
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

    // fallback: empty cards
    console.warn("LOAD CARDS fallback EMPTY:", last);
    return [];
  }

  async function loadResult() {
    const sid = String(sessionId || "").trim();
    if (!sid) return;

    setErr("");

    // 1) load cluster result
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

      // 2) load cards to resolve texts
      const cards = await loadSessionCards(sid);
      const cardMap = buildCardMap(cards);

      // 3) normalize clusters using cardMap
      const normalized = normalizeClustersWithCardMap(out, cardMap);

      setRawResult(out);
      setClusters(normalized);
      setAgreed(false); // bila load result baru, perlu agreed semula
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
      // A) lama: /api/cluster/run/:sid (anda nampak 404)
      { path: `/api/cluster/run/${encodeURIComponent(sid)}`, body: {} },

      // B) body sessionId (ini yang SUCCESS dalam console anda)
      { path: `/api/cluster/run`, body: { sessionId: sid } },

      // C) body sid (fallback)
      { path: `/api/cluster/run`, body: { sid } },

      // D) query ?session=
      { path: `/api/cluster/run?session=${encodeURIComponent(sid)}`, body: {} },
    ];

    let lastErr = "";

    try {
      for (const t of tries) {
        try {
          console.log("TRY:", t.path, t.body);
          await apiPost(t.path, t.body);
          console.log("SUCCESS:", t.path);
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

  // fallback endpoint (ikut corak backend berbeza-beza)
  const tries = [
    // A) style lama (path param)
    { path: `/api/cluster/apply/${encodeURIComponent(sid)}`, body: { clusters, source: "manual_edit_before_merge" } },

    // B) style body sessionId
    { path: `/api/cluster/apply`, body: { sessionId: sid, clusters, source: "manual_edit_before_merge" } },

    // C) style body sid
    { path: `/api/cluster/apply`, body: { sid, clusters, source: "manual_edit_before_merge" } },

    // D) style query
    { path: `/api/cluster/apply?session=${encodeURIComponent(sid)}`, body: { clusters, source: "manual_edit_before_merge" } },
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

    alert("Apply AI (Merge) berjaya. Sila semak output seterusnya.");

    // 1) Refresh result supaya UI konsisten (optional)
    await loadResult();

    // 2) ✅ AUTO PERGI KE OUTPUT SETERUSNYA
    // Pilih SATU destinasi yang betul untuk flow anda:
    // - CPC: "#/cpc?session="
    // - CP:  "#/cp?session="
    // - Board: "#/board?session=" (jika board anda guna query)
    window.location.hash = `#/cpc?session=${encodeURIComponent(sid)}`;

  } catch (e) {
    setErr(String(e?.message || e));
    alert(String(e?.message || e));
  } finally {
    setBusy(false);
  }
}

  // ====== EDIT ACTIONS ======
  function renameCluster(clusterId, newTitle) {
    setClusters((prev) =>
      prev.map((c) => (c.id === clusterId ? { ...c, title: newTitle } : c))
    );
    setAgreed(false);
  }

  function addCluster() {
    setClusters((prev) => [
      ...prev,
      { id: `c${Date.now()}`, title: "Cluster Baharu", items: [] },
    ]);
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

      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
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
      </div>

      {/* status */}
      <div style={{ marginTop: 10, fontSize: 13, opacity: 0.85 }}>
        Session: <b>{String(sessionId || "")}</b>{" "}
        {agreed ? (
          <span style={{ marginLeft: 10, color: "green", fontWeight: 700 }}>
            ✓ AGREED
          </span>
        ) : (
          <span style={{ marginLeft: 10, color: "#b45309", fontWeight: 700 }}>
            ✱ BELUM AGREED
          </span>
        )}
      </div>

      {err ? <div style={{ marginTop: 10, color: "#b91c1c" }}>Error: {err}</div> : null}

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
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
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
                  title={
                    (c.items || []).length > 0
                      ? "Hanya boleh buang cluster yang kosong"
                      : "Buang cluster kosong"
                  }
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

      {rawResult?.generatedAt ? (
        <div style={{ marginTop: 10, fontSize: 12, opacity: 0.75 }}>
          generatedAt: {String(rawResult.generatedAt)}
        </div>
      ) : null}
    </div>
  );
}
