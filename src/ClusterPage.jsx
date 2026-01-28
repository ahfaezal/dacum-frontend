import React, { useEffect, useMemo, useState } from "react";

const API_BASE =
  (import.meta?.env?.VITE_API_BASE && String(import.meta.env.VITE_API_BASE)) ||
  "https://dacum-backend.onrender.com";

/**
 * Ambil query param daripada:
 * 1) window.location.search  -> ?session=Masjid
 * 2) window.location.hash    -> #/cluster?session=Masjid
 */
function getQueryParam(name) {
  // 1) normal query: ?session=...
  const s = new URLSearchParams(window.location.search);
  const v1 = s.get(name);
  if (v1) return v1;

  // 2) hash query: #/cluster?session=...
  const h = window.location.hash || "";
  const qIndex = h.indexOf("?");
  if (qIndex === -1) return "";
  const qs = h.slice(qIndex + 1);
  const s2 = new URLSearchParams(qs);
  return s2.get(name) || "";
}

async function apiGet(path) {
  const url = `${API_BASE}${path}`;
  const r = await fetch(url, { method: "GET" });
  const text = await r.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // ignore
  }
  if (!r.ok) {
    const msg =
      (json && (json.error || json.message)) ||
      text ||
      `GET ${path} gagal (${r.status})`;
    throw new Error(msg);
  }
  return json ?? {};
}

async function apiPost(path, body) {
  const url = `${API_BASE}${path}`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const text = await r.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // ignore
  }
  if (!r.ok) {
    const msg =
      (json && (json.error || json.message)) ||
      text ||
      `POST ${path} gagal (${r.status})`;
    throw new Error(msg);
  }
  return json ?? {};
}

function normalizeClustersFromResult(result, cardsById) {
  const rawClusters = Array.isArray(result?.clusters) ? result.clusters : [];

  const clusters = rawClusters.map((c, idx) => {
    const cid = String(c?.id || `cl_${idx}`);
    const title = String(c?.title || c?.name || `Cluster ${idx + 1}`);

    const cardIds = Array.isArray(c?.cardIds) ? c.cardIds : [];
    const items = cardIds.map((id) => {
      const card = cardsById?.[id];
      if (card) return card;
      return { id, activity: `(Kad tidak dijumpai: ${id})`, time: "", _src: "missing" };
    });

    return { id: cid, title, items };
  });

  const unassignedIds = Array.isArray(result?.unassigned) ? result.unassigned : [];
  const unassigned = unassignedIds.map((id) => {
    const card = cardsById?.[id];
    if (card) return card;
    return { id, activity: `(Kad tidak dijumpai: ${id})`, time: "", _src: "missing" };
  });

  return { clusters, unassigned };
}

export default function ClusterPage({ onBack }) {
  const initialSession = getQueryParam("session") || "Masjid";

  const [sessionId, setSessionId] = useState(initialSession);

  const [busy, setBusy] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [err, setErr] = useState("");

  // RESULT RAW (untuk debug / rujukan)
  const [clusterResult, setClusterResult] = useState(null);

  // Cards (asal dari LiveBoard / backend store)
  const [cards, setCards] = useState([]); // [{id, activity, time, _src}]
  const cardsById = useMemo(() => {
    const m = {};
    for (const c of cards) m[String(c.id)] = c;
    return m;
  }, [cards]);

  // Editable clustering sebelum merge
  const [clusters, setClusters] = useState([]); // [{id,title,items:[card]}]
  const [unassigned, setUnassigned] = useState([]); // [card]
  const [agreed, setAgreed] = useState(false);

  // Output CU/WA selepas apply / reload
  const [cuWaOutput, setCuWaOutput] = useState(null);

  const sidTrim = String(sessionId || "").trim();

  async function loadCards(sid) {
    if (!sid) return [];
    // ✅ server.js anda ada route: GET /cards/:sessionId
    const data = await apiGet(`/cards/${encodeURIComponent(sid)}`);
    const items = Array.isArray(data?.items) ? data.items : [];
    const normalized = items.map((x) => ({
      id: String(x.id || ""),
      activity: String(x.activity || x.text || x.title || ""),
      time: String(x.time || ""),
      _src: String(x._src || x.src || ""),
      name: x.name ? String(x.name) : "",
    }));
    setCards(normalized);
    return normalized;
  }

  async function loadResult() {
    const sid = sidTrim;
    if (!sid) return;

    setBusy(true);
    setErr("");
    try {
      // 1) ambil cards dahulu (supaya boleh resolve cardIds -> activity)
      const cardList = await loadCards(sid);
      const map = {};
      for (const c of cardList) map[String(c.id)] = c;

      // 2) ambil cluster result
      const result = await apiGet(`/api/cluster/result/${encodeURIComponent(sid)}`);
      setClusterResult(result);

      const { clusters: normClusters, unassigned: normUnassigned } =
        normalizeClustersFromResult(result, map);

      setClusters(normClusters);
      setUnassigned(normUnassigned);

      // agreed status (kalau backend simpan)
      setAgreed(!!result?.agreed);
    } catch (e) {
      setErr(String(e?.message || e));
      // kalau tiada result, jangan kacau clusters lama sangat — tapi reset basic
      setClusters([]);
      setUnassigned([]);
      setClusterResult(null);
    } finally {
      setBusy(false);
      setAiLoading(false);
    }
  }

  async function runClustering() {
    const sid = sidTrim;
    if (!sid) return alert("Sila isi Session dulu.");

    setBusy(true);
    setAiLoading(true);
    setErr("");

    try {
      // Backend: POST /api/cluster/run { sessionId }
      await apiPost(`/api/cluster/run`, { sessionId: sid });

      // Lepas run, reload result
      await loadResult();
    } catch (e) {
      setErr(String(e?.message || e));
      alert(String(e?.message || e));
    } finally {
      setBusy(false);
      setAiLoading(false);
    }
  }

  async function applyMerge() {
    const sid = sidTrim;
    if (!sid) return alert("Sila isi Session dulu.");
    if (!agreed) return alert("Sila klik Agreed dahulu sebelum Apply AI (Merge).");

    setBusy(true);
    setErr("");
    try {
      // Backend: POST /api/cluster/apply { sessionId }
      const r = await apiPost(`/api/cluster/apply`, { sessionId: sid });

      // selepas apply, kita boleh reload output CU/WA
      await loadCuWaOutput(sid);

      // refresh result juga
      setClusterResult(r);
      await loadResult();
    } catch (e) {
      setErr(String(e?.message || e));
      alert(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  async function loadCuWaOutput(sid) {
    if (!sid) return;
    setBusy(true);
    setErr("");
    try {
      // server.js anda ada: GET /api/session/cus/:sessionId
      const out = await apiGet(`/api/session/cus/${encodeURIComponent(sid)}`);
      setCuWaOutput(out);
    } catch (e) {
      setErr(String(e?.message || e));
      setCuWaOutput(null);
    } finally {
      setBusy(false);
    }
  }

  async function buildMyspikeIndex() {
    setBusy(true);
    setErr("");
    try {
      // server.js: POST /api/myspike/index/build
      const r = await apiPost(`/api/myspike/index/build`, {});
      alert(`Index MySPIKE siap. Total: ${r?.total ?? "?"}`);
    } catch (e) {
      setErr(String(e?.message || e));
      alert(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  async function runMyspikeComparison() {
    const sid = sidTrim;
    if (!sid) return alert("Sila isi Session dulu.");

    setBusy(true);
    setErr("");
    try {
      // Ambil CU dari session (hasil apply/reload)
      const out = await apiGet(`/api/session/cus/${encodeURIComponent(sid)}`);
      const cus = Array.isArray(out?.cus) ? out.cus : Array.isArray(out?.items) ? out.items : [];

      if (!cus.length) {
        alert("Tiada CU untuk compare. Sila Apply AI (Merge) atau pastikan session.cus wujud.");
        return;
      }

      const r = await apiPost(`/api/s2/compare`, {
        sessionId: sid,
        cus,
        options: { thresholdAda: 0.78, topK: 3 },
        meta: { sessionId: sid },
      });

      // paparkan dalam CU/WA output section (guna slot yang sama supaya mudah)
      setCuWaOutput((prev) => ({ ...(prev || {}), myspikeCompare: r }));
      alert("MySPIKE Comparison siap.");
    } catch (e) {
      setErr(String(e?.message || e));
      alert(String(e?.message || e));
    } finally {
      setBusy(false);
    }
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

      const idx = (from.items || []).findIndex((x) => String(x.id) === String(itemId));
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

  // Load last result on mount
  useEffect(() => {
    // auto-load bila masuk page
    loadResult();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
          style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #ccc", minWidth: 220 }}
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

        <button onClick={buildMyspikeIndex} disabled={busy} style={{ height: 36 }}>
          Build MySPIKE Index
        </button>

        <button onClick={runMyspikeComparison} disabled={busy} style={{ height: 36 }}>
          Run AI Comparison (MySPIKE)
        </button>
      </div>

      <div style={{ marginTop: 8, color: "#444" }}>
        Session: <b>{sidTrim || "-"}</b> &nbsp;&nbsp;
        {agreed ? (
          <span style={{ color: "green", fontWeight: 700 }}>✓ AGREED</span>
        ) : (
          <span style={{ color: "#c77800", fontWeight: 700 }}>* BELUM AGREED</span>
        )}
      </div>

      {err ? (
        <div style={{ marginTop: 8, color: "crimson" }}>
          <b>Error:</b> {err}
        </div>
      ) : null}

      {/* EDIT CLUSTERING */}
      <div
        style={{
          marginTop: 14,
          border: "1px solid #ddd",
          borderRadius: 12,
          padding: 12,
          background: "#fff",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <div>
            <h3 style={{ margin: "4px 0" }}>Edit Clustering (sebelum Merge)</h3>
            <div style={{ fontSize: 13, color: "#666" }}>
              Anda boleh: ubah tajuk cluster dan pindahkan aktiviti. Selepas selesai, tekan <b>Agreed</b> untuk lock
              sebelum <b>Apply AI (Merge)</b>.
            </div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={addCluster} disabled={busy} style={{ height: 34 }}>
              + Add Cluster
            </button>
            <button onClick={doAgreed} disabled={busy} style={{ height: 34 }}>
              Agreed
            </button>
          </div>
        </div>

        {!clusters.length ? (
          <div style={{ marginTop: 12, color: "#666" }}>Belum ada hasil clustering. Tekan Run AI (Clustering).</div>
        ) : (
          <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
            {clusters.map((c) => (
              <div key={c.id} style={{ border: "1px solid #eee", borderRadius: 12, padding: 10 }}>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <input
                    value={c.title}
                    onChange={(e) => {
                      const v = e.target.value;
                      setClusters((prev) => prev.map((x) => (x.id === c.id ? { ...x, title: v } : x)));
                      setAgreed(false);
                    }}
                    style={{
                      fontSize: 16,
                      fontWeight: 700,
                      width: "100%",
                      padding: "10px 12px",
                      borderRadius: 10,
                      border: "1px solid #ddd",
                    }}
                  />
                  <button
                    onClick={() => removeEmptyCluster(c.id)}
                    disabled={busy}
                    title="Buang cluster (manual)"
                    style={{ height: 38 }}
                  >
                    Buang
                  </button>
                </div>

                {/* ✅ PAPAR SENARAI AKTIVITI DALAM CLUSTER */}
                <div style={{ marginTop: 10 }}>
                  {(c.items || []).length ? (
                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                      {c.items.map((it) => (
                        <li key={it.id} style={{ margin: "6px 0", lineHeight: 1.35 }}>
                          <span style={{ fontWeight: 600 }}>{it.activity || "(tiada teks)"}</span>
                          {it.time ? (
                            <span style={{ color: "#777", marginLeft: 10, fontSize: 12 }}>({it.time})</span>
                          ) : null}
                          {it._src ? (
                            <span style={{ color: "#999", marginLeft: 10, fontSize: 12 }}>[{it._src}]</span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div style={{ color: "#888", fontSize: 13 }}>Tiada aktiviti dalam cluster ini.</div>
                  )}
                </div>

                {/* Quick move helper (optional) */}
                {(unassigned || []).length ? (
                  <div style={{ marginTop: 10, borderTop: "1px dashed #eee", paddingTop: 10 }}>
                    <div style={{ fontSize: 12, color: "#666", marginBottom: 6 }}>
                      Pindah aktiviti dari <b>Unassigned</b> ke cluster ini:
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {unassigned.slice(0, 8).map((u) => (
                        <button
                          key={u.id}
                          disabled={busy}
                          onClick={() => {
                            // pindah unassigned -> cluster
                            setUnassigned((prev) => prev.filter((x) => x.id !== u.id));
                            setClusters((prev) =>
                              prev.map((x) => (x.id === c.id ? { ...x, items: [...(x.items || []), u] } : x))
                            );
                            setAgreed(false);
                          }}
                          style={{ height: 30, fontSize: 12 }}
                          title={u.activity}
                        >
                          + {String(u.activity || "").slice(0, 26)}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ))}

            {/* UNASSIGNED */}
            <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 10 }}>
              <div style={{ fontWeight: 800, marginBottom: 8 }}>Unassigned</div>
              {unassigned.length ? (
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {unassigned.map((u) => (
                    <li key={u.id} style={{ margin: "6px 0", lineHeight: 1.35 }}>
                      <span style={{ fontWeight: 600 }}>{u.activity || "(tiada teks)"}</span>
                      {u.time ? <span style={{ color: "#777", marginLeft: 10, fontSize: 12 }}>({u.time})</span> : null}
                      {u._src ? <span style={{ color: "#999", marginLeft: 10, fontSize: 12 }}>[{u._src}]</span> : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <div style={{ color: "#888", fontSize: 13 }}>Tiada unassigned.</div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* MySPIKE Comparison */}
      <div style={{ marginTop: 18 }}>
        <h2 style={{ marginBottom: 8 }}>MySPIKE Comparison</h2>
        {!cuWaOutput?.myspikeCompare ? (
          <div style={{ color: "#666" }}>Tiada comparison lagi. Klik Run AI Comparison (MySPIKE).</div>
        ) : (
          <pre
            style={{
              background: "#0b1020",
              color: "#e7e7e7",
              padding: 12,
              borderRadius: 12,
              overflowX: "auto",
              fontSize: 12,
            }}
          >
            {JSON.stringify(cuWaOutput.myspikeCompare, null, 2)}
          </pre>
        )}
      </div>

      {/* CU/WA OUTPUT */}
      <div style={{ marginTop: 18 }}>
        <h2 style={{ marginBottom: 8 }}>CU/WA (hasil Apply)</h2>
        {!cuWaOutput ? (
          <div style={{ color: "#666" }}>
            Tiada output CU/WA. Klik Apply AI (Merge) atau Reload CU (cus).
            {clusterResult?.generatedAt ? (
              <div style={{ marginTop: 6, fontSize: 12, color: "#888" }}>
                cluster generatedAt: {String(clusterResult.generatedAt)}
              </div>
            ) : null}
          </div>
        ) : (
          <pre
            style={{
              background: "#0b1020",
              color: "#e7e7e7",
              padding: 12,
              borderRadius: 12,
              overflowX: "auto",
              fontSize: 12,
            }}
          >
            {JSON.stringify(cuWaOutput, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}
