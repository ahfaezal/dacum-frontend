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

function safeArr(v) {
  return Array.isArray(v) ? v : [];
}

function pickAppliedMeta(cuWaOutput) {
  const o = cuWaOutput || {};
  return {
    ok: !!o.ok,
    sessionId: String(o.sessionId || ""),
    appliedAt: String(o.appliedAt || o.appliedAtISO || o.applied_at || ""),
    cus: safeArr(o.cus),
  };
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

function normId(v) {
  if (v === null || v === undefined) return "";
  const s = String(v).trim();
  if (s === "null" || s === "undefined") return "";
  return s;
}

function normalizeClustersFromResult(result, cardsById, cardsList) {
  const rawClusters = Array.isArray(result?.clusters) ? result.clusters : [];
  const list = Array.isArray(cardsList) ? cardsList : [];

  const getCard = (rawId) => {
    const k = normId(rawId);
    if (!k) return null;

    // 1) cuba match terus pada id (UUID)
    const byId = cardsById?.[k];
    if (byId) return byId;

    // 2) fallback: kalau id nampak nombor, cuba sebagai index
    //    (boleh jadi 0-based atau 1-based)
    const n = Number(k);
    if (Number.isFinite(n)) {
      const i0 = Math.trunc(n);     // 0-based
      const i1 = Math.trunc(n) - 1; // 1-based

      if (list[i0]) return list[i0];
      if (list[i1]) return list[i1];
    }

    return null;
  };

  const clusters = rawClusters.map((c, idx) => {
    const cid = String(c?.id || `cl_${idx}`);
    const title = String(c?.title || c?.name || `Cluster ${idx + 1}`);

    const cardIds = Array.isArray(c?.cardIds) ? c.cardIds : [];
    const items = cardIds
      .map((id) => normId(id))
      .filter(Boolean) // buang null/empty
      .map((id) => {
        const card = getCard(id);
        if (card) return card;
        return { id, activity: `(Kad tidak dijumpai: ${id})`, time: "", _src: "missing" };
      });

    return { id: cid, title, items };
  });

  const unassignedIds = Array.isArray(result?.unassigned) ? result.unassigned : [];
  const unassigned = unassignedIds
    .map((id) => normId(id))
    .filter(Boolean)
    .map((id) => {
      const card = getCard(id);
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
    (cards || []).forEach((c) => {
      const id = normId(c?.id ?? c?.cardId ?? c?._id);
      if (id) m[id] = c;
    });
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
  const s = String(sid || "").trim();
  if (!s) return [];

  // ✅ Ambil dari LiveBoard (S3) supaya konsisten dengan clustering
  const lb = await apiGet(`/api/liveboard/${encodeURIComponent(s)}`);

  // backend liveboard biasanya pulang { ok:true, source:"s3", data:{ sessionId, cards:[...] } }
  const raw = Array.isArray(lb?.data?.cards) ? lb.data.cards : [];

  // Normalisasi minimum supaya UI stabil
  const normalized = raw
    .map((c) => ({
      id: String(c?.id ?? "").trim(),
      activity: String(c?.activity ?? "").trim(),
      time: String(c?.time ?? c?.createdAt ?? "").trim(),
      name: String(c?.name ?? c?.panelName ?? "").trim(),
      _src: String(c?.source ?? c?._src ?? "").trim(),
    }))
    .filter((c) => c.id && c.activity);

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
      for (const c of cardList) {
        const id = String(c?.id ?? "").trim();
        if (id) map[id] = c;
      }

      // 2) ambil cluster result
      const result = await apiGet(`/api/cluster/result/${encodeURIComponent(sid)}`);
      setClusterResult(result);

      const { clusters: normClusters, unassigned: normUnassigned } =
        normalizeClustersFromResult(result, map, cardList);

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
      await apiPost(`/api/cluster/run/${encodeURIComponent(sid)}`, {});

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
  <div style={{ padding: 24, fontFamily: "system-ui, Arial" }}>
    <h1 style={{ marginTop: 0 }}>Cluster Page</h1>

    {onBack ? (
      <button onClick={onBack} style={{ marginBottom: 10 }}>
        Back
      </button>
    ) : null}

    {/* ACTION BAR */}
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      <input
        value={sessionId}
        onChange={(e) => setSessionId(e.target.value)}
        style={{
          padding: "8px 10px",
          borderRadius: 10,
          border: "1px solid #ccc",
          minWidth: 220,
        }}
      />

      <button onClick={runClustering} disabled={busy} style={{ height: 36 }}>
        {aiLoading ? "NOSS AI Loading..." : "Run AI (Clustering)"}
      </button>

      <button onClick={loadResult} disabled={busy} style={{ height: 36 }}>
        Reload Result
      </button>

      <button onClick={applyMerge} disabled={busy || !agreed} style={{ height: 36 }}>
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

    <div style={{ marginTop: 8, marginBottom: 14 }}>
      <span>
        Session: <b>{sidTrim || "-"}</b>
      </span>
      <span style={{ marginLeft: 10, color: agreed ? "green" : "#cc7a00" }}>
        {agreed ? "✓ AGREED" : "* BELUM AGREED"}
      </span>
    </div>

    {err ? (
      <div style={{ background: "#ffecec", border: "1px solid #ffb3b3", padding: 10, borderRadius: 8 }}>
        <b>Error:</b> {err}
      </div>
    ) : null}

    {/* EDIT CLUSTERING */}
    <div style={{ marginTop: 16, padding: 12, border: "1px solid #eee", borderRadius: 10 }}>
      <h2 style={{ marginTop: 0 }}>Edit Clustering (sebelum Merge)</h2>
      <div style={{ color: "#555", marginBottom: 10 }}>
        Anda boleh: ubah tajuk cluster dan pindahkan aktiviti. Selepas selesai, tekan Agreed untuk lock sebelum Apply AI (Merge).
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button onClick={addCluster} disabled={busy}>+ Add Cluster</button>
        <button onClick={doAgreed} disabled={busy}>Agreed</button>
      </div>

      {!clusters.length ? (
        <div style={{ color: "#666" }}>Belum ada hasil clustering. Tekan Run AI (Clustering).</div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {clusters.map((c) => (
            <div key={c.id} style={{ border: "1px solid #eee", borderRadius: 12, padding: 12 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
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
                <button onClick={() => removeEmptyCluster(c.id)} disabled={busy} title="Buang cluster (manual)">
                  Buang
                </button>
              </div>

              <div style={{ marginTop: 10 }}>
                {(c.items || []).length ? (
                  <ul style={{ margin: "6px 0 0 18px" }}>
                    {c.items.map((it) => (
                      <li key={String(it.id)} style={{ margin: "6px 0" }}>
                        <b>{it.activity || "(tiada teks)"}</b>{" "}
                        {it.time ? <span style={{ color: "#777" }}>({it.time})</span> : null}{" "}
                        {it._src ? <span style={{ color: "#777" }}>[{it._src}]</span> : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div style={{ color: "#666" }}>Tiada aktiviti dalam cluster ini.</div>
                )}
              </div>
            </div>
          ))}

          {/* UNASSIGNED */}
          <div style={{ borderTop: "1px solid #eee", paddingTop: 10 }}>
            <h3 style={{ margin: "8px 0" }}>Unassigned</h3>
            {unassigned.length ? (
              <ul style={{ margin: "6px 0 0 18px" }}>
                {unassigned.map((u) => (
                  <li key={String(u.id)} style={{ margin: "6px 0" }}>
                    <b>{u.activity || "(tiada teks)"}</b>{" "}
                    {u.time ? <span style={{ color: "#777" }}>({u.time})</span> : null}{" "}
                    {u._src ? <span style={{ color: "#777" }}>[{u._src}]</span> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <div style={{ color: "#666" }}>Tiada unassigned.</div>
            )}
          </div>
        </div>
      )}
    </div>

    {/* MySPIKE Comparison */}
    <div style={{ marginTop: 16 }}>
      <h2>MySPIKE Comparison</h2>
      {!cuWaOutput?.myspikeCompare ? (
        <div style={{ color: "#666" }}>Tiada comparison lagi. Klik Run AI Comparison (MySPIKE).</div>
      ) : (
        <pre style={{ background: "#0b1020", color: "#e7e7e7", padding: 12, borderRadius: 12, overflowX: "auto", fontSize: 12 }}>
          {JSON.stringify(cuWaOutput.myspikeCompare, null, 2)}
        </pre>
      )}
    </div>

    {/* CU/WA OUTPUT */}
    <div style={{ marginTop: 16 }}>
      <h2>CU/WA (hasil Apply)</h2>

      {!cuWaOutput ? (
        <div style={{ color: "#666" }}>
          Tiada output CU/WA. Klik Apply AI (Merge) atau Reload CU (cus).
          {clusterResult?.generatedAt ? (
            <div style={{ marginTop: 6, color: "#777" }}>
              cluster generatedAt: {String(clusterResult.generatedAt)}
            </div>
          ) : null}
        </div>
      ) : (
        <div style={{ marginTop: 8 }}>
          <div style={{ marginBottom: 10, color: "#555", fontSize: 13 }}>
            sessionId: <b>{String(cuWaOutput?.sessionId || "-")}</b>
            {" | "}
            appliedAt:{" "}
            <b>
              {String(
                cuWaOutput?.appliedAt ||
                  cuWaOutput?.appliedAtISO ||
                  cuWaOutput?.applied_at ||
                  "-"
              )}
            </b>
          </div>

          {(Array.isArray(cuWaOutput?.cus) ? cuWaOutput.cus : []).map((cu, idx) => {
            const cuId = String(cu?.cuId || `CU-${String(idx + 1).padStart(2, "0")}`);
            const cuTitle = String(cu?.cuTitle || cu?.title || "Untitled CU");
            const activities = Array.isArray(cu?.activities) ? cu.activities : [];

            return (
              <div
                key={`${cuId}_${idx}`}
                style={{
                  border: "1px solid #e5e5e5",
                  borderRadius: 8,
                  padding: 12,
                  marginBottom: 12,
                  background: "#fff",
                }}
              >
                <div style={{ fontWeight: 700, marginBottom: 6 }}>
                  {cuId}: {cuTitle}
                </div>

                <ul style={{ margin: "6px 0 0 18px" }}>
                  {activities.map((wa, j) => {
                    const waId = String(wa?.waId || `WA-${String(j + 1).padStart(2, "0")}`);
                    const waTitle = String(wa?.waTitle || wa?.title || `Aktiviti ${j + 1}`);
                    return (
                      <li key={`${waId}_${j}`} style={{ margin: "4px 0" }}>
                        <b>{waId}:</b> {waTitle}
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  </div>
);
