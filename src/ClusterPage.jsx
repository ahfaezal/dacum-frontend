import React, { useEffect, useMemo, useRef, useState } from "react";

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

function normId(v) {
  if (v === null || v === undefined) return "";
  const s = String(v).trim();
  if (s === "null" || s === "undefined") return "";
  return s;
}

function uid(prefix = "c") {
  return `${prefix}${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

/**
 * Normalize result clusters -> items(card) menggunakan:
 * - cardsById: map id -> card
 * - cardsList: array cards (untuk fallback index 0-based/1-based)
 */
function normalizeClustersFromResult(result, cardsById, cardsList) {
  const rawClusters = Array.isArray(result?.clusters) ? result.clusters : [];
  const list = Array.isArray(cardsList) ? cardsList : [];

  const getCard = (rawId) => {
    const k = normId(rawId);
    if (!k) return null;

    // 1) match terus pada id
    const byId = cardsById?.[k];
    if (byId) return byId;

    // 2) fallback index jika nampak nombor
    const n = Number(k);
    if (Number.isFinite(n)) {
      const i0 = Math.trunc(n); // 0-based
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
      .filter(Boolean)
      .map((id) => {
        const card = getCard(id);
        if (card) return card;
        return {
          id,
          activity: `(Kad tidak dijumpai: ${id})`,
          time: "",
          name: "",
          _src: "missing",
        };
      });

    return { id: cid, title, items };
  });

  const unassignedIds = Array.isArray(result?.unassigned)
    ? result.unassigned
    : [];
  const unassigned = unassignedIds
    .map((id) => normId(id))
    .filter(Boolean)
    .map((id) => {
      const card = getCard(id);
      if (card) return card;
      return {
        id,
        activity: `(Kad tidak dijumpai: ${id})`,
        time: "",
        name: "",
        _src: "missing",
      };
    });

  return { clusters, unassigned };
}

export default function ClusterPage({ onBack }) {
  const initialSession = getQueryParam("session") || "Masjid";

  const [sessionId, setSessionId] = useState(initialSession);
  const [busy, setBusy] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [err, setErr] = useState("");

  // RAW cluster result
  const [clusterResult, setClusterResult] = useState(null);

  // Cards dari LiveBoard (S3)
  const [cards, setCards] = useState([]); // [{id, activity, time, name, _src}]
  const cardsById = useMemo(() => {
    const m = {};
    (cards || []).forEach((c) => {
      const id = normId(c?.id ?? c?.cardId ?? c?._id);
      if (id) m[id] = c;
    });
    return m;
  }, [cards]);

  // Editable clusters
  const [clusters, setClusters] = useState([]); // [{id,title,items:[card]}]
  const [unassigned, setUnassigned] = useState([]); // [card]
  const [agreed, setAgreed] = useState(false);

  // Output CU/WA selepas apply / reload
  const [cuWaOutput, setCuWaOutput] = useState(null);

  // UI edit state
  const [editingClusterId, setEditingClusterId] = useState(null); // cluster.id
  const [editingCardKey, setEditingCardKey] = useState(null); // `${bucket}:${clusterId}:${cardId}` or `u:cardId`
  const dragRef = useRef(null); // { from: { type:'cluster'|'unassigned', clusterId? }, cardId }

  // Override teks kad (edit lokal) — TAK ubah LiveBoard
  const [overrides, setOverrides] = useState({}); // { [cardId]: { activityOverride: string } }

  const sidTrim = String(sessionId || "").trim();
  const locked = agreed; // Lock selepas Agreed

  function safeSetErr(e) {
    setErr(String(e?.message || e || ""));
  }

  function getCardText(card) {
    const id = normId(card?.id);
    const ov = overrides?.[id]?.activityOverride;
    return (ov !== undefined && ov !== null && String(ov).trim() !== "")
      ? String(ov)
      : String(card?.activity || "").trim();
  }

  async function loadCards(sid) {
    const s = String(sid || "").trim();
    if (!s) return [];

    // ✅ tarik dari LiveBoard (S3) supaya konsisten
    const lb = await apiGet(`/api/liveboard/${encodeURIComponent(s)}`);

    // liveboard: { ok:true, source:"s3", data:{ sessionId, cards:[...] } }
    const raw = Array.isArray(lb?.data?.cards) ? lb.data.cards : [];

    const normalized = raw
      .map((c) => ({
        id: normId(c?.id),
        activity: String(c?.activity ?? "").trim(),
        time: String(c?.time ?? c?.createdAt ?? "").trim(),
        name: String(c?.name ?? c?.panelName ?? "").trim(),
        _src: String(c?.source ?? c?._src ?? "panel").trim(),
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
      // 1) cards dulu
      const cardList = await loadCards(sid);
      const map = {};
      for (const c of cardList) {
        const id = normId(c?.id);
        if (id) map[id] = c;
      }

      // 2) result
      const result = await apiGet(
        `/api/cluster/result/${encodeURIComponent(sid)}`
      );

      setClusterResult(result);

      const { clusters: normClusters, unassigned: normUnassigned } =
        normalizeClustersFromResult(result, map, cardList);

      setClusters(normClusters);
      setUnassigned(normUnassigned);

      // agreed flag (jika backend hantar)
      setAgreed(!!result?.agreed);
      setEditingClusterId(null);
      setEditingCardKey(null);
    } catch (e) {
      safeSetErr(e);
      setClusterResult(null);
      setClusters([]);
      setUnassigned([]);
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
      await apiPost(`/api/cluster/run/${encodeURIComponent(sid)}`, {});
      await loadResult();
      setOverrides({}); // reset override selepas clustering baru (pilihan selamat)
      setAgreed(false);
    } catch (e) {
      safeSetErr(e);
      alert(String(e?.message || e));
    } finally {
      setBusy(false);
      setAiLoading(false);
    }
  }

  async function loadCuWaOutput(sid) {
    const s = String(sid || "").trim();
    if (!s) return;

    setBusy(true);
    setErr("");

    try {
      const out = await apiGet(`/api/session/cus/${encodeURIComponent(s)}`);
      setCuWaOutput(out);
    } catch (e) {
      safeSetErr(e);
      setCuWaOutput(null);
    } finally {
      setBusy(false);
    }
  }

  function buildDraftPayload() {
    // Hantar draft clustering yang telah diedit panel
    const clustersDraft = (clusters || []).map((c) => ({
      id: String(c.id),
      title: String(c.title || "").trim(),
      cardIds: (c.items || []).map((it) => normId(it?.id)).filter(Boolean),
    }));
    const unassignedDraft = (unassigned || [])
      .map((u) => normId(u?.id))
      .filter(Boolean);

    // overridesDraft hanya simpan yang benar-benar ada perubahan
    const overridesDraft = {};
    Object.keys(overrides || {}).forEach((cardId) => {
      const v = overrides?.[cardId]?.activityOverride;
      if (v !== undefined && v !== null && String(v).trim() !== "") {
        overridesDraft[cardId] = { activityOverride: String(v) };
      }
    });

    return { clustersDraft, unassignedDraft, overridesDraft };
  }

const r = await apiPost(`/api/cluster/apply`, {
  sessionId: sid,

  // ✅ INI YANG PENTING — hantar clustering yang telah diedit
  clusters: clusters.map((c) => ({
    id: c.id,
    title: c.title,
    cardIds: (c.items || []).map((it) => String(it.id)),
  })),

  unassigned: (unassigned || []).map((u) => String(u.id)),
  unassignedIds: (unassigned || []).map((u) => String(u.id)),
});

      // refresh output CU/WA
      await loadCuWaOutput(sid);

      // refresh cluster result
      setClusterResult(r);
      await loadResult();
    } catch (e) {
      safeSetErr(e);
      alert(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  async function buildMyspikeIndex() {
    setBusy(true);
    setErr("");
    try {
      const r = await apiPost(`/api/myspike/index/build`, {});
      alert(`Index MySPIKE siap. Total: ${r?.total ?? "?"}`);
    } catch (e) {
      safeSetErr(e);
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
      const out = await apiGet(`/api/session/cus/${encodeURIComponent(sid)}`);
      const cus = Array.isArray(out?.cus)
        ? out.cus
        : Array.isArray(out?.items)
        ? out.items
        : [];

      if (!cus.length) {
        alert(
          "Tiada CU untuk compare. Sila Apply AI (Merge) atau pastikan session.cus wujud."
        );
        return;
      }

      const r = await apiPost(`/api/s2/compare`, {
        sessionId: sid,
        cus,
        options: { thresholdAda: 0.78, topK: 3 },
        meta: { sessionId: sid },
      });

      setCuWaOutput((prev) => ({ ...(prev || {}), myspikeCompare: r }));
      alert("MySPIKE Comparison siap.");
    } catch (e) {
      safeSetErr(e);
      alert(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  // ========= EDIT: CLUSTER =========
  function addCluster() {
    if (locked) return;
    const id = uid("cl_");
    setClusters((prev) => [
      ...prev,
      { id, title: "Cluster Baharu", items: [] },
    ]);
    setAgreed(false);
    setEditingClusterId(id);
  }

  function removeCluster(clusterId) {
    if (locked) return;
    const target = clusters.find((c) => c.id === clusterId);
    if (!target) return;

    if ((target.items || []).length > 0) {
      alert("Cluster ini ada kad. Pindahkan kad dahulu sebelum buang cluster.");
      return;
    }

    setClusters((prev) => prev.filter((c) => c.id !== clusterId));
    setAgreed(false);
  }

  function updateClusterTitle(clusterId, title) {
    if (locked) return;
    setClusters((prev) =>
      prev.map((x) => (x.id === clusterId ? { ...x, title } : x))
    );
    setAgreed(false);
  }

  // ========= EDIT: CARD TEXT OVERRIDE =========
  function setCardOverride(cardId, newText) {
    if (locked) return;
    const id = normId(cardId);
    if (!id) return;
    setOverrides((prev) => ({
      ...(prev || {}),
      [id]: { ...(prev?.[id] || {}), activityOverride: newText },
    }));
    setAgreed(false);
  }

  // ========= DRAG & DROP (native) =========
  function onDragStartCard(e, from, cardId) {
    if (locked) return;
    const payload = { from, cardId: normId(cardId) };
    dragRef.current = payload;
    try {
      e.dataTransfer.setData("text/plain", JSON.stringify(payload));
    } catch (_) {}
    e.dataTransfer.effectAllowed = "move";
  }

  function onDragOverDropzone(e) {
    if (locked) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }

  function removeCardFromCluster(prevClusters, fromClusterId, cardId) {
    return prevClusters.map((c) => {
      if (c.id !== fromClusterId) return c;
      return { ...c, items: (c.items || []).filter((it) => normId(it.id) !== cardId) };
    });
  }

  function addCardToCluster(prevClusters, toClusterId, cardObj) {
    return prevClusters.map((c) => {
      if (c.id !== toClusterId) return c;
      const exists = (c.items || []).some((it) => normId(it.id) === normId(cardObj.id));
      if (exists) return c;
      return { ...c, items: [...(c.items || []), cardObj] };
    });
  }

  function findCardObject(cardId) {
    const id = normId(cardId);
    if (!id) return null;

    // 1) cuba dalam clusters
    for (const c of clusters || []) {
      const hit = (c.items || []).find((it) => normId(it.id) === id);
      if (hit) return hit;
    }
    // 2) cuba dalam unassigned
    const uHit = (unassigned || []).find((u) => normId(u.id) === id);
    if (uHit) return uHit;

    // 3) fallback: cardsById
    const base = cardsById?.[id];
    return base || null;
  }

  function onDropToCluster(e, toClusterId) {
    if (locked) return;
    e.preventDefault();

    let payload = dragRef.current;
    try {
      const txt = e.dataTransfer.getData("text/plain");
      if (txt) payload = JSON.parse(txt);
    } catch (_) {}

    const from = payload?.from;
    const cardId = normId(payload?.cardId);
    if (!cardId) return;

    const cardObj = findCardObject(cardId);
    if (!cardObj) return;

    // jika drop dalam cluster yang sama, ignore
    if (from?.type === "cluster" && from?.clusterId === toClusterId) return;

    // 1) remove dari asal
    if (from?.type === "cluster" && from?.clusterId) {
      setClusters((prev) => removeCardFromCluster(prev, from.clusterId, cardId));
    } else if (from?.type === "unassigned") {
      setUnassigned((prev) => (prev || []).filter((u) => normId(u.id) !== cardId));
    }

    // 2) add ke dest cluster
    setClusters((prev) => addCardToCluster(prev, toClusterId, cardObj));
    setAgreed(false);
    dragRef.current = null;
  }

  function onDropToUnassigned(e) {
    if (locked) return;
    e.preventDefault();

    let payload = dragRef.current;
    try {
      const txt = e.dataTransfer.getData("text/plain");
      if (txt) payload = JSON.parse(txt);
    } catch (_) {}

    const from = payload?.from;
    const cardId = normId(payload?.cardId);
    if (!cardId) return;

    const cardObj = findCardObject(cardId);
    if (!cardObj) return;

    // jika dari unassigned drop unassigned, ignore
    if (from?.type === "unassigned") return;

    // remove dari cluster asal
    if (from?.type === "cluster" && from?.clusterId) {
      setClusters((prev) => removeCardFromCluster(prev, from.clusterId, cardId));
    }

    // add ke unassigned jika belum ada
    setUnassigned((prev) => {
      const exists = (prev || []).some((u) => normId(u.id) === cardId);
      if (exists) return prev;
      return [...(prev || []), cardObj];
    });

    setAgreed(false);
    dragRef.current = null;
  }

async function doAgreed() {
  if (!clusters.length) {
    alert("Tiada clustering untuk di-Agreed.\nSila Run AI (Clustering) dahulu.");
    return;
  }
  const hasEmptyTitle = clusters.some((c) => !String(c.title || "").trim());
  if (hasEmptyTitle) {
    alert("Sila pastikan semua tajuk cluster diisi sebelum Agreed.");
    return;
  }

  setBusy(true);
  setErr("");
  try {
    // ✅ simpan versi yang telah diedit ke backend
    await apiPost(`/api/cluster/agreed`, {
      sessionId: sidTrim,
      agreed: true,
      clusters: clusters.map((c) => ({
        id: c.id,
        title: c.title,
        // simpan hanya card ids supaya ringan
        cardIds: (c.items || []).map((it) => String(it.id)),
      })),
      unassigned: (unassigned || []).map((u) => String(u.id)),
    });

    setAgreed(true);
    // optional: reload supaya UI ikut sumber backend
    await loadResult();
  } catch (e) {
    setErr(String(e?.message || e));
    alert(String(e?.message || e));
  } finally {
    setBusy(false);
  }
}

  // Auto-load bila masuk page
  useEffect(() => {
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
      <div
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
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

        <button
          onClick={applyMerge}
          disabled={busy || !agreed}
          style={{ height: 36 }}
          title={!agreed ? "Sila Agreed dahulu" : "Apply AI (Merge)"}
        >
          Apply AI (Merge)
        </button>

        <button
          onClick={() => loadCuWaOutput(sidTrim)}
          disabled={busy}
          style={{ height: 36 }}
          title="Tarik semula output CU/WA dari server (session.cus)"
        >
          Reload CU (cus)
        </button>

        <button
          onClick={buildMyspikeIndex}
          disabled={busy}
          style={{ height: 36 }}
        >
          Build MySPIKE Index
        </button>

        <button
          onClick={runMyspikeComparison}
          disabled={busy}
          style={{ height: 36 }}
        >
          Run AI Comparison (MySPIKE)
        </button>
      </div>

      <div style={{ marginTop: 8, marginBottom: 14 }}>
        <span>
          Session: <b>{sidTrim || "-"}</b>
        </span>
        <span style={{ marginLeft: 10, color: agreed ? "green" : "#cc7a00" }}>
          {agreed ? "✓ AGREED (LOCKED)" : "* BELUM AGREED"}
        </span>
      </div>

      {err ? (
        <div
          style={{
            background: "#ffecec",
            border: "1px solid #ffb3b3",
            padding: 10,
            borderRadius: 8,
          }}
        >
          <b>Error:</b> {err}
        </div>
      ) : null}

      {/* EDIT CLUSTERING */}
      <div
        style={{
          marginTop: 16,
          padding: 12,
          border: "1px solid #eee",
          borderRadius: 10,
        }}
      >
        <h2 style={{ marginTop: 0 }}>Edit Clustering (sebelum Merge)</h2>
        <div style={{ color: "#555", marginBottom: 10 }}>
          Anda boleh: edit tajuk cluster, edit teks kad (override), dan drag & drop
          kad antara cluster / Unassigned. Selepas selesai, tekan <b>Agreed</b> untuk lock sebelum Apply AI (Merge).
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <button onClick={addCluster} disabled={busy || locked}>
            + Add Cluster
          </button>
          <button onClick={doAgreed} disabled={busy || locked}>
            Agreed
          </button>
          {locked ? (
            <span style={{ color: "#0a7a2a", alignSelf: "center", fontWeight: 700 }}>
              Locked
            </span>
          ) : null}
        </div>

        {!clusters.length ? (
          <div style={{ color: "#666" }}>
            Belum ada hasil clustering. Tekan Run AI (Clustering).
          </div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {clusters.map((c) => (
              <div
                key={c.id}
                onDragOver={onDragOverDropzone}
                onDrop={(e) => onDropToCluster(e, c.id)}
                style={{
                  border: "1px solid #eee",
                  borderRadius: 12,
                  padding: 12,
                  background: "#fff",
                }}
                title={locked ? "Locked" : "Drop kad di sini untuk pindahkan ke cluster ini"}
              >
                {/* Cluster Header */}
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <div style={{ flex: 1 }}>
                    {editingClusterId === c.id && !locked ? (
                      <input
                        value={c.title}
                        onChange={(e) => updateClusterTitle(c.id, e.target.value)}
                        onBlur={() => setEditingClusterId(null)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") setEditingClusterId(null);
                        }}
                        autoFocus
                        style={{
                          fontSize: 16,
                          fontWeight: 800,
                          width: "100%",
                          padding: "10px 12px",
                          borderRadius: 10,
                          border: "1px solid #ddd",
                        }}
                      />
                    ) : (
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ fontSize: 16, fontWeight: 800 }}>{c.title}</div>
                        <button
                          disabled={busy || locked}
                          onClick={() => setEditingClusterId(c.id)}
                          title="Edit nama cluster"
                          style={{ height: 28 }}
                        >
                          Edit
                        </button>
                      </div>
                    )}
                    <div style={{ fontSize: 12, color: "#777", marginTop: 2 }}>
                      Jumlah kad: {(c.items || []).length}
                    </div>
                  </div>

                  <button
                    onClick={() => removeCluster(c.id)}
                    disabled={busy || locked}
                    title="Buang cluster (hanya jika kosong)"
                    style={{ height: 28 }}
                  >
                    Buang
                  </button>
                </div>

                {/* Cards */}
                <div style={{ marginTop: 10 }}>
                  {(c.items || []).length ? (
                    <ul style={{ margin: "6px 0 0 18px", display: "grid", gap: 8 }}>
                      {c.items.map((it) => {
                        const cardId = normId(it?.id);
                        const key = `c:${c.id}:${cardId}`;
                        const editing = editingCardKey === key && !locked;

                        return (
                          <li
                            key={cardId}
                            draggable={!locked}
                            onDragStart={(e) =>
                              onDragStartCard(e, { type: "cluster", clusterId: c.id }, cardId)
                            }
                            style={{
                              margin: 0,
                              padding: 10,
                              borderRadius: 10,
                              border: "1px solid #eee",
                              background: "#fafafa",
                            }}
                            title={locked ? "Locked" : "Drag untuk pindah ke cluster lain / Unassigned"}
                          >
                            <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                              <div style={{ flex: 1 }}>
                                {editing ? (
                                  <textarea
                                    value={overrides?.[cardId]?.activityOverride ?? getCardText(it)}
                                    onChange={(e) => setCardOverride(cardId, e.target.value)}
                                    onBlur={() => setEditingCardKey(null)}
                                    rows={2}
                                    autoFocus
                                    style={{
                                      width: "100%",
                                      padding: "8px 10px",
                                      borderRadius: 8,
                                      border: "1px solid #ccc",
                                      resize: "vertical",
                                    }}
                                  />
                                ) : (
                                  <div style={{ fontWeight: 700 }}>
                                    {getCardText(it) || "(tiada teks)"}
                                  </div>
                                )}

                                <div style={{ marginTop: 4, fontSize: 12, color: "#777" }}>
                                  {it.time ? <span>({it.time}) </span> : null}
                                  {it._src ? <span>[{it._src}] </span> : null}
                                  {it.name ? <span>— {it.name}</span> : null}
                                </div>
                              </div>

                              <button
                                disabled={busy || locked}
                                onClick={() => setEditingCardKey(editing ? null : key)}
                                title="Edit teks kad"
                                style={{ height: 28 }}
                              >
                                Edit
                              </button>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <div style={{ color: "#666" }}>Tiada aktiviti dalam cluster ini.</div>
                  )}
                </div>
              </div>
            ))}

            {/* UNASSIGNED */}
            <div
              onDragOver={onDragOverDropzone}
              onDrop={onDropToUnassigned}
              style={{
                borderTop: "1px solid #eee",
                paddingTop: 10,
                borderRadius: 12,
                padding: 12,
                background: "#fff",
              }}
              title={locked ? "Locked" : "Drop kad di sini untuk pindahkan ke Unassigned"}
            >
              <h3 style={{ margin: "8px 0" }}>Unassigned</h3>

              {unassigned.length ? (
                <ul style={{ margin: "6px 0 0 18px", display: "grid", gap: 8 }}>
                  {unassigned.map((u) => {
                    const cardId = normId(u?.id);
                    const key = `u:${cardId}`;
                    const editing = editingCardKey === key && !locked;

                    return (
                      <li
                        key={cardId}
                        draggable={!locked}
                        onDragStart={(e) =>
                          onDragStartCard(e, { type: "unassigned" }, cardId)
                        }
                        style={{
                          margin: 0,
                          padding: 10,
                          borderRadius: 10,
                          border: "1px solid #eee",
                          background: "#fafafa",
                        }}
                        title={locked ? "Locked" : "Drag untuk pindah ke cluster"}
                      >
                        <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                          <div style={{ flex: 1 }}>
                            {editing ? (
                              <textarea
                                value={overrides?.[cardId]?.activityOverride ?? getCardText(u)}
                                onChange={(e) => setCardOverride(cardId, e.target.value)}
                                onBlur={() => setEditingCardKey(null)}
                                rows={2}
                                autoFocus
                                style={{
                                  width: "100%",
                                  padding: "8px 10px",
                                  borderRadius: 8,
                                  border: "1px solid #ccc",
                                  resize: "vertical",
                                }}
                              />
                            ) : (
                              <div style={{ fontWeight: 700 }}>
                                {getCardText(u) || "(tiada teks)"}
                              </div>
                            )}

                            <div style={{ marginTop: 4, fontSize: 12, color: "#777" }}>
                              {u.time ? <span>({u.time}) </span> : null}
                              {u._src ? <span>[{u._src}] </span> : null}
                              {u.name ? <span>— {u.name}</span> : null}
                            </div>
                          </div>

                          <button
                            disabled={busy || locked}
                            onClick={() => setEditingCardKey(editing ? null : key)}
                            title="Edit teks kad"
                            style={{ height: 28 }}
                          >
                            Edit
                          </button>
                        </div>
                      </li>
                    );
                  })}
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
          <div style={{ color: "#666" }}>
            Tiada comparison lagi. Klik Run AI Comparison (MySPIKE).
          </div>
        ) : (
          <MySpikeComparisonView data={cuWaOutput?.myspikeCompare} />
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

            {(Array.isArray(cuWaOutput?.cus) ? cuWaOutput.cus : []).map(
              (cu, idx) => {
                const cuId = String(
                  cu?.cuId || `CU-${String(idx + 1).padStart(2, "0")}`
                );
                const cuTitle = String(
                  cu?.cuTitle || cu?.title || "Untitled CU"
                );
                const activities = Array.isArray(cu?.activities)
                  ? cu.activities
                  : [];

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
                        const waId = String(
                          wa?.waId || `WA-${String(j + 1).padStart(2, "0")}`
                        );
                        const waTitle = String(
                          wa?.waTitle || wa?.title || `Aktiviti ${j + 1}`
                        );
                        return (
                          <li key={`${waId}_${j}`} style={{ margin: "4px 0" }}>
                            <b>{waId}:</b> {waTitle}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              }
            )}
          </div>
        )}
      </div>
    </div>
  );
} // ✅ PENTING: tutup function ClusterPage

function Badge({ status }) {
  const s = String(status || "").toUpperCase();
  const isAda = s === "ADA";

  const style = {
    display: "inline-block",
    padding: "2px 10px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 800,
    border: "1px solid",
    background: isAda ? "#E7F7EE" : "#F2F2F2",
    color: isAda ? "#0F6A3B" : "#333",
    borderColor: isAda ? "#9AD8B2" : "#DDD",
    lineHeight: "18px",
  };

  return <span style={style}>{s || "—"}</span>;
}

function fmtNum(x, d = 4) {
  const n = Number(x);
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(d);
}

function MySpikeComparisonView({ data }) {
  const [filter, setFilter] = React.useState("ALL"); // ALL | ADA | TIADA
  const [q, setQ] = React.useState("");

  if (!data?.ok) {
    return (
      <div className="mt-4 p-3 rounded border bg-white">
        <div className="font-semibold">MySPIKE Comparison</div>
        <div className="text-sm text-gray-600 mt-1">
          Tiada data comparison untuk dipaparkan.
        </div>
      </div>
    );
  }

  const results = Array.isArray(data.results) ? data.results : [];
  const summary = data.summary || {};
  const meta = data.myspike || {};
  const sessionId = data.sessionId || data.meta?.sessionId || "—";

  const filtered = results.filter((r) => {
    const title = String(r?.input?.cuTitle || "").toLowerCase();
    const status = String(r?.decision?.status || "").toUpperCase();
    if (filter !== "ALL" && status !== filter) return false;
    if (q && !title.includes(q.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="mt-4">
      {/* Header + Summary */}
      <div className="p-4 rounded-lg border bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-lg font-bold">MySPIKE Comparison</div>
            <div className="text-sm text-gray-600">
              Session: <span className="font-semibold">{sessionId}</span> · Source:{" "}
              <span className="font-semibold">{meta.source || "—"}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              className={`px-3 py-1 rounded border text-sm ${
                filter === "ALL" ? "bg-gray-900 text-white" : "bg-white"
              }`}
              onClick={() => setFilter("ALL")}
            >
              Semua
            </button>
            <button
              className={`px-3 py-1 rounded border text-sm ${
                filter === "ADA" ? "bg-gray-900 text-white" : "bg-white"
              }`}
              onClick={() => setFilter("ADA")}
            >
              ADA ({summary.ada ?? 0})
            </button>
            <button
              className={`px-3 py-1 rounded border text-sm ${
                filter === "TIADA" ? "bg-gray-900 text-white" : "bg-white"
              }`}
              onClick={() => setFilter("TIADA")}
            >
              TIADA ({summary.tiada ?? 0})
            </button>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-1 md:grid-cols-5 gap-2 text-sm">
          <div className="p-2 rounded bg-gray-50 border">
            <div className="text-gray-500">Total CU</div>
            <div className="font-semibold">{summary.totalCU ?? results.length}</div>
          </div>
          <div className="p-2 rounded bg-gray-50 border">
            <div className="text-gray-500">Candidates</div>
            <div className="font-semibold">{meta.totalCandidates ?? "—"}</div>
          </div>
          <div className="p-2 rounded bg-gray-50 border">
            <div className="text-gray-500">Embedding Model</div>
            <div className="font-semibold">{meta.embeddingModel ?? "—"}</div>
          </div>
          <div className="p-2 rounded bg-gray-50 border">
            <div className="text-gray-500">Loaded At</div>
            <div className="font-semibold">
              {meta.loadedAt ? new Date(meta.loadedAt).toLocaleString() : "—"}
            </div>
          </div>
          <div className="p-2 rounded bg-gray-50 border">
            <div className="text-gray-500">Paparan</div>
            <div className="font-semibold">{filtered.length} item</div>
          </div>
        </div>

        <div className="mt-3">
          <input
            className="w-full md:w-1/2 px-3 py-2 border rounded"
            placeholder="Cari tajuk CU…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </div>

      {/* Results list */}
      <div className="mt-3 space-y-3">
        {filtered.map((r, i) => {
          const input = r.input || {};
          const dec = r.decision || {};
          const matches = Array.isArray(r.matches) ? r.matches : [];

          return (
            <details key={i} className="p-4 rounded-lg border bg-white">
              <summary className="cursor-pointer select-none">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-[240px]">
                    <div className="font-semibold">
                      {input.cuTitle || "(Tiada tajuk CU)"}
                    </div>
                    <div className="text-xs text-gray-600">
                      Activities: {input.activitiesCount ?? "—"} · CU Code:{" "}
                      {input.cuCode || "—"}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <Badge status={dec.status} />
                    <div className="text-xs text-gray-700">
                      Best: <span className="font-semibold">{fmtNum(dec.bestScore)}</span>
                      {" · "}
                      Th: <span className="font-semibold">{fmtNum(dec.thresholdAda, 2)}</span>
                      {" · "}
                      Conf: <span className="font-semibold">{dec.confidence || "—"}</span>
                    </div>
                  </div>
                </div>
              </summary>

              <div className="mt-3">
                <div className="text-sm font-semibold mb-2">Top Matches</div>
                <div className="overflow-x-auto">
                  <table className="min-w-[720px] w-full text-sm border">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-left p-2 border">#</th>
                        <th className="text-left p-2 border">CU Code</th>
                        <th className="text-left p-2 border">CU Title</th>
                        <th className="text-left p-2 border">Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {matches.length ? (
                        matches.map((m, j) => (
                          <tr key={j}>
                            <td className="p-2 border">{j + 1}</td>
                            <td className="p-2 border font-mono">{m.cuCode || "—"}</td>
                            <td className="p-2 border">{m.cuTitle || "—"}</td>
                            <td className="p-2 border">{fmtNum(m.score)}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td className="p-2 border" colSpan={4}>
                            Tiada matches.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </details>
          );
        })}
      </div>
    </div>
  );
}
