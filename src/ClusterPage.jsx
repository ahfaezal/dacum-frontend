import React, { useEffect, useRef, useState, useMemo } from "react";

const API_BASE =
  import.meta.env.VITE_API_BASE || "https://dacum-backend.onrender.com";

const apiBase = String(API_BASE || "")
  .trim()
  .replace("onrenderer.com", "onrender.com")
  .replace(/\/+$/, "");

  // =========================
  // Session + tuning params
  // =========================
  export default function ClusterPage({ initialSessionId = "Masjid", onBack }) {
  const [sessionId, setSessionId] = useState(initialSessionId);
  const [similarityThreshold, setSimilarityThreshold] = useState(0.55);
  const [minClusterSize, setMinClusterSize] = useState(2);
  const [maxClusters, setMaxClusters] = useState(12);
  // Auto ambil session dari URL (?session=Masjid)
  useEffect(() => {
  const h = String(window.location.hash || "");
  const qs = h.includes("?") ? h.split("?")[1] : "";
  const sp = new URLSearchParams(qs);
  const s = sp.get("session");
  if (s) setSessionId(String(s));
  }, []);

  // =========================
  // Data + UI state
  // =========================
  const [data, setData] = useState(null); // raw response from backend
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all"); // all | assigned | unassigned

// =========================
// Manual clustering state
// =========================

// Kad mentah dari Live Board (API /api/cards/:session)
const [rawCards, setRawCards] = useState([]);

const [cus, setCus] = useState([]); // [{ id, title, notes }]
const [assignments, setAssignments] = useState({}); // { [cardId]: cuId }

// Abort fetch if user klik banyak kali
const abortRef = useRef(null);

  // =========================
  // Helpers
  // =========================
  function safeTitle(s) {
    const t = String(s || "").trim();
    return t || "CU";
  }

  function slugify(s) {
    return String(s || "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
  }

  function makeCuIdFromTitle(title) {
    const base = slugify(title) || "cu";
    return `ai-${base}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  const clusters = Array.isArray(data?.clusters) ? data.clusters : [];
  const params = data?.params || {};
  const meta = data?.meta || {};

  // Build cards list from AI response (best effort)
  const aiCards = useMemo(() => {
    const out = [];
    const seen = new Set();

    for (const cl of clusters) {
      const items = Array.isArray(cl?.items) ? cl.items : [];
      for (const it of items) {
        const id = it?.id;
        const name = String(it?.name || "").trim();
        if (id == null || !name) continue;
        const key = String(id);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
          id: key,
          activity: name,
          time: "",
        });
      }
    }

    // Optional placeholders for unassigned IDs (no name from backend)
    if (Array.isArray(data?.unassigned)) {
      for (const uid of data.unassigned) {
        const key = String(uid);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
          id: key,
          activity: `(Unassigned ID: ${key})`,
          time: "",
          placeholder: true,
        });
      }
    }

    return out;
  }, [clusters, data?.unassigned]);

  const cuOptions = useMemo(
    () => cus.map((c) => ({ id: c.id, title: c.title })),
    [cus]
  );

  const assignedCount = useMemo(() => {
    const keys = Object.keys(assignments || {});
    let n = 0;
    for (const k of keys) if (assignments[k]) n++;
    return n;
  }, [assignments]);

const filteredCards = useMemo(() => {
  const q = String(query || "").toLowerCase().trim();

  return rawCards.filter((c) => {
    const isAssigned = Boolean(assignments[String(c.id)]);
    if (filter === "assigned" && !isAssigned) return false;
    if (filter === "unassigned" && isAssigned) return false;

    if (!q) return true;
    return String(c.activity || "").toLowerCase().includes(q);
  });
}, [rawCards, assignments, filter, query]);

  function buildExportJson() {
    const cuMap = new Map(cus.map((c) => [c.id, c.title]));
    const rows = aiCards.map((c) => {
      const cuId = assignments[String(c.id)] || "";
      return {
        cardId: String(c.id),
        activity: String(c.activity || ""),
        cuId,
        cuTitle: cuId ? cuMap.get(cuId) || "" : "",
      };
    });

    return {
      sessionId: String(sessionId || "").trim(),
      exportedAt: new Date().toISOString(),
      stats: {
        totalCards: aiCards.length,
        totalCU: cus.length,
        assigned: assignedCount,
        unassigned: Math.max(0, aiCards.length - assignedCount),
      },
      cus: cus.map((c) => ({ cuId: c.id, title: c.title, notes: c.notes || "" })),
      assignments: rows,
      rawAI: data,
    };
  }

  function copyToClipboard(text) {
    try {
      navigator.clipboard.writeText(text);
      alert("JSON telah disalin (copy) ke clipboard.");
    } catch (e) {
      console.error(e);
      alert("Gagal copy. Sila copy manual dari kotak JSON.");
    }
  }

useEffect(() => {
  loadRawCards();
}, [sessionId]);
    
// =========================
// LIVE refresh (polling) - SESSION SUMMARY SAHAJA
// (Tidak panggil /api/cluster/preview supaya tak "auto preview")
// =========================
useEffect(() => {
  let alive = true;
  const sid = String(sessionId || "").trim();
  if (!sid) return;

  async function tick() {
    if (!alive) return;
    try {
      const r = await fetch(
        `${apiBase}/api/session/summary/${encodeURIComponent(sid)}`
      );
      
      const j = await r.json();
      if (alive && j && j.ok) setSummary(j);
    } catch (e) {
      // diam
    }
  }

  // jalan sekali bila mount / tukar session
  tick();

  // polling setiap 1.5s
  const t = setInterval(tick, 1500);

  return () => {
    alive = false;
    clearInterval(t);
  };
}, [apiBase, sessionId]);
  
  // =========================
  // Actions
  // =========================

  async function loadRawCards() {
  const sid = String(sessionId || "").trim();
  if (!sid) return;

  try {
    const res = await fetch(
      `${apiBase}/api/cards/${encodeURIComponent(sid)}`
    );
    const json = await res.json();

    // Backend pulangkan array terus
    const cards = Array.isArray(json) ? json : json?.cards || [];

    setRawCards(
      cards.map((c) => ({
        id: String(c.id),
        activity: String(c.name || c.activity || ""),
        time: c.createdAt || c.time || "",
      }))
    );
  } catch (e) {
    console.error("Gagal load kad mentah:", e);
  }
}
    async function loadCluster(opts = {}) {
    const silent = !!opts.silent;
    const sid = String(sessionId || "").trim();
    if (!sid) {
      setErr("Sila isi Session ID dahulu.");
      setData(null);
      return;
    }

    setLoading(true);
    setErr("");

    // abort previous request
    try {
      if (abortRef.current) abortRef.current.abort();
    } catch {}
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(`${apiBase}/api/cluster/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          sessionId: sid,
          similarityThreshold: Number(similarityThreshold),
          minClusterSize: Number(minClusterSize),
          maxClusters: Number(maxClusters),
        }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(
          `HTTP ${res.status}: ${text || "Request gagal. Sila semak backend."}`
        );
      }

      const json = await res.json();
      setData(json);
      if (!silent) alert("AI clustering berjaya.");
    } catch (e) {
      if (String(e?.name) === "AbortError") return;
      setErr(e?.message ? String(e.message) : String(e));
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  function resetAll() {
    setErr("");
    setData(null);
    setQuery("");
    setFilter("all");
    setCus([]);
    setAssignments({});
  }

  function createNewCU() {
    const title = prompt("Nama CU baru:", `CU ${cus.length + 1}`);
    if (!title) return;
    const cu = {
      id: `cu-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      title: safeTitle(title),
      notes: "",
    };
    setCus((prev) => [...prev, cu]);
  }

  function deleteCU(cuId) {
    if (!cuId) return;
    const ok = confirm("Padam CU ini? Semua assignment ke CU ini akan jadi Unassigned.");
    if (!ok) return;

    setCus((prev) => prev.filter((c) => c.id !== cuId));
    setAssignments((prev) => {
      const next = { ...(prev || {}) };
      for (const k of Object.keys(next)) {
        if (next[k] === cuId) delete next[k];
      }
      return next;
    });
  }

  function renameCU(cuId, newTitle) {
    setCus((prev) =>
      prev.map((c) => (c.id === cuId ? { ...c, title: safeTitle(newTitle) } : c))
    );
  }

  function setCardAssignment(cardId, cuId) {
    const key = String(cardId);
    setAssignments((prev) => ({
      ...(prev || {}),
      [key]: cuId || "",
    }));
  }

  /**
   * Apply AI result:
   * mode="merge"  -> tambah CU yang belum ada + assign yang belum di-assign (tak override manual)
   * mode="replace"-> reset CU + assignment ikut AI sepenuhnya
   */
  function applyAIResult(mode = "merge") {
    if (!data || !Array.isArray(data.clusters) || data.clusters.length === 0) {
      alert("Tiada AI result untuk apply.");
      return;
    }

    const rawClusters = data.clusters;

    // Normalise cluster shape:
    // - title: theme || title || fallback
    // - ids: from items[].id or cardIds[]
    const norm = rawClusters.map((cl, idx) => {
      const title = safeTitle(cl?.theme || cl?.title || `CU ${idx + 1}`);

      const idsFromItems = Array.isArray(cl?.items)
        ? cl.items.map((it) => it?.id).filter((x) => x != null)
        : [];

      const idsFromCardIds = Array.isArray(cl?.cardIds)
        ? cl.cardIds.filter((x) => x != null)
        : [];

      const ids = (idsFromItems.length ? idsFromItems : idsFromCardIds).map((x) =>
        String(x)
      );

      return { title, ids };
    });

    if (mode === "replace") {
      // Replace: build fresh CU + assignments
      const newCus = norm.map((c) => ({
        id: makeCuIdFromTitle(c.title),
        title: c.title,
        notes: "Auto (AI)",
      }));

      const titleToCuId = new Map(newCus.map((c) => [c.title, c.id]));
      const nextAssignments = {};

      for (const c of norm) {
        const cuId = titleToCuId.get(c.title);
        if (!cuId) continue;
        for (const cardId of c.ids) nextAssignments[cardId] = cuId;
      }

      setCus(newCus);
      setAssignments(nextAssignments);
      alert("Apply AI (Replace) siap. Semua CU/assignment ditetapkan ikut AI.");
      return;
    }

    // Merge mode:
    // 1) tambah CU yang belum wujud (matching by title)
    // 2) assign card yang belum ada assignment sahaja (tak override manual)
    setCus((prevCus) => {
      const existing = Array.isArray(prevCus) ? [...prevCus] : [];
      const titleToId = new Map(
        existing.map((c) => [String(c.title || "").trim(), c.id])
      );

      for (const c of norm) {
        const t = String(c.title || "").trim();
        if (!t) continue;
        if (!titleToId.has(t)) {
          const newCu = {
            id: makeCuIdFromTitle(t),
            title: t,
            notes: "Auto-generated dari AI Preview",
          };
          existing.push(newCu);
          titleToId.set(t, newCu.id);
        }
      }

      // Simpan mapping utk step assignments (guna ref temp)
      applyAIResult.__titleToId = titleToId;
      return existing;
    });

    setAssignments((prev) => {
      const next = { ...(prev || {}) };
      const alreadyAssigned = new Set(
        Object.keys(next)
          .filter((k) => next[k])
          .map((k) => String(k))
      );

      const titleToId =
        applyAIResult.__titleToId instanceof Map
          ? applyAIResult.__titleToId
          : new Map();

      for (const c of norm) {
        const cuId = titleToId.get(String(c.title || "").trim());
        if (!cuId) continue;

        for (const cardId of c.ids) {
          if (alreadyAssigned.has(cardId)) continue; // jangan override manual
          next[cardId] = cuId;
          alreadyAssigned.add(cardId);
        }
      }

      // cleanup temp
      try {
        delete applyAIResult.__titleToId;
      } catch {}

      return next;
    });

    alert("Apply AI (Merge) siap. Sila semak & betulkan jika perlu.");
  }

  // =========================
  // UI
  // =========================
  return (
    <div style={{ padding: 20, maxWidth: 1200, margin: "0 auto" }}>
      <h2 style={{ marginTop: 0 }}>Clustering CU (MVP)</h2>

      <div style={{ fontSize: 13, color: "#555", marginBottom: 10 }}>
        Status: <strong>connected</strong> | API: <code>{apiBase}</code> | Session:{" "}
        <strong>{String(sessionId || "").trim() || "-"}</strong>{" "}
        <span style={{ marginLeft: 10 }}>
          Total: <strong>{aiCards.length}</strong> | Assigned:{" "}
          <strong>{assignedCount}</strong> | Unassigned:{" "}
          <strong>{Math.max(0, aiCards.length - assignedCount)}</strong>
        </span>
      </div>

{/* Controls */}
      <div
        style={{
          border: "1px solid #ddd",
          borderRadius: 12,
          padding: 12,
          marginBottom: 12,
          background: "#fff",
        }}
      >
        <div
          style={{
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            alignItems: "end",
          }}
        >
          {onBack ? (
            <button
              onClick={onBack}
              style={{
                padding: "10px 12px",
                borderRadius: 8,
                border: "1px solid #ccc",
                background: "#fff",
                cursor: "pointer",
              }}
            >
              ← Back
            </button>
          ) : null}

          <div style={{ minWidth: 260 }}>
            <div style={{ fontSize: 12, marginBottom: 6 }}>Carian Aktiviti</div>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="contoh: khutbah / jenazah / jadual..."
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 8,
                border: "1px solid #ccc",
              }}
            />
          </div>

          <div style={{ minWidth: 180 }}>
            <div style={{ fontSize: 12, marginBottom: 6 }}>Filter</div>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 8,
                border: "1px solid #ccc",
                background: "#fff",
              }}
            >
              <option value="all">Semua</option>
              <option value="unassigned">Unassigned</option>
              <option value="assigned">Assigned</option>
            </select>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              onClick={createNewCU}
              style={{
                padding: "10px 12px",
                borderRadius: 8,
                border: "1px solid #ccc",
                background: "#fff",
                cursor: "pointer",
              }}
            >
              + CU Baru
            </button>

            <button
              onClick={loadCluster}
              disabled={loading}
              style={{
                padding: "10px 12px",
                borderRadius: 8,
                border: "1px solid #111",
                background: loading ? "#eee" : "#111",
                color: loading ? "#333" : "#fff",
                cursor: loading ? "not-allowed" : "pointer",
              }}
              title="Jana AI cluster preview (REAL)"
            >
              {loading ? "Menjana..." : "AI Cluster (Preview)"}
            </button>

            <button
              onClick={() => applyAIResult("merge")}
              disabled={!data || !Array.isArray(data.clusters) || data.clusters.length === 0}
              style={{
                padding: "10px 12px",
                borderRadius: 8,
                border: "1px solid #111",
                background:
                  !data || !Array.isArray(data.clusters) || data.clusters.length === 0
                    ? "#eee"
                    : "#0a7",
                color:
                  !data || !Array.isArray(data.clusters) || data.clusters.length === 0
                    ? "#333"
                    : "#fff",
                cursor:
                  !data || !Array.isArray(data.clusters) || data.clusters.length === 0
                    ? "not-allowed"
                    : "pointer",
              }}
              title="Merge AI result → tambah CU + assign yang belum di-assign (tak override manual)"
            >
              Apply AI (Merge)
            </button>

            <button
              onClick={() => applyAIResult("replace")}
              disabled={!data || !Array.isArray(data.clusters) || data.clusters.length === 0}
              style={{
                padding: "10px 12px",
                borderRadius: 8,
                border: "1px solid #111",
                background:
                  !data || !Array.isArray(data.clusters) || data.clusters.length === 0
                    ? "#eee"
                    : "#f59f00",
                color:
                  !data || !Array.isArray(data.clusters) || data.clusters.length === 0
                    ? "#333"
                    : "#111",
                cursor:
                  !data || !Array.isArray(data.clusters) || data.clusters.length === 0
                    ? "not-allowed"
                    : "pointer",
              }}
              title="Replace AI result → reset CU + assignment ikut AI sepenuhnya"
            >
              Apply AI (Replace)
            </button>

            <button
              onClick={() => {
                const payload = buildExportJson();
                copyToClipboard(JSON.stringify(payload, null, 2));
              }}
              disabled={aiCards.length === 0}
              style={{
                padding: "10px 12px",
                borderRadius: 8,
                border: "1px solid #ccc",
                background: "#fff",
                cursor: aiCards.length === 0 ? "not-allowed" : "pointer",
              }}
              title="Salin JSON hasil CU + assignment"
            >
              Export JSON (Copy)
            </button>

            <button
              onClick={resetAll}
              style={{
                padding: "10px 12px",
                borderRadius: 8,
                border: "1px solid #ff4d4f",
                background: "#fff",
                color: "#ff4d4f",
                cursor: "pointer",
              }}
              title="Reset paparan + kosongkan CU/assignment"
            >
              Reset
            </button>
          </div>
        </div>
        
        {/* Tuning */}
        <div style={{ marginTop: 10, display: "flex", gap: 12, flexWrap: "wrap" }}>
          <div style={{ minWidth: 260 }}>
            <div style={{ fontSize: 12, marginBottom: 6 }}>
              similarityThreshold ({Number(similarityThreshold).toFixed(2)})
            </div>
            <input
              type="range"
              min="0.30"
              max="0.90"
              step="0.01"
              value={similarityThreshold}
              onChange={(e) => setSimilarityThreshold(Number(e.target.value))}
              style={{ width: "100%" }}
            />
          </div>

          <div style={{ minWidth: 160 }}>
            <div style={{ fontSize: 12, marginBottom: 6 }}>minClusterSize</div>
            <input
              type="number"
              min="2"
              max="10"
              value={minClusterSize}
              onChange={(e) => setMinClusterSize(Number(e.target.value))}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 8,
                border: "1px solid #ccc",
              }}
            />
          </div>

          <div style={{ minWidth: 160 }}>
            <div style={{ fontSize: 12, marginBottom: 6 }}>maxClusters</div>
            <input
              type="number"
              min="1"
              max="50"
              value={maxClusters}
              onChange={(e) => setMaxClusters(Number(e.target.value))}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 8,
                border: "1px solid #ccc",
              }}
            />
          </div>

          <div style={{ fontSize: 12, color: "#666", alignSelf: "end" }}>
            {data?.generatedAt ? (
              <>
                Generated: <code>{data.generatedAt}</code>{" "}
          <span style={{ color: "#888" }}>
            (params: thr={String(params.similarityThreshold ?? similarityThreshold)}, min=
            {String(params.minClusterSize ?? minClusterSize)}, max=
            {String(params.maxClusters ?? maxClusters)})
          </span>
              </>
            ) : (
              <span>
                Tip: Klik “AI Cluster (Preview)” → “Apply AI (Merge/Replace)” → semak/ubah manual → Export JSON
              </span>
            )}
          </div>
        </div>

        {/* Error */}
{err ? (
  <div
    style={{
      marginTop: 10,
      border: "1px solid #f5c2c7",
      background: "#f8d7da",
      color: "#842029",
      padding: 10,
      borderRadius: 10,
    }}
  >
    {err}
  </div>
) : null}

        {/* Raw AI summary */}
        {data ? (
          <div style={{ marginTop: 10, fontSize: 12, color: "#555" }}>
            AI Preview: totalCards=<strong>{data.totalCards ?? "-"}</strong> | clusters=
            <strong>{meta.totalClusters ?? clusters.length}</strong> | clusteredItems=
            <strong>{meta.totalClusteredItems ?? "-"}</strong> | unassigned=
            <strong>{meta.unassignedCount ?? (data.unassigned?.length ?? 0)}</strong>
          </div>
        ) : null}
      </div>

      {/* Main layout: Aktiviti Mentah | Senarai CU | Butiran */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "420px 320px 1fr",
          gap: 12,
          alignItems: "start",
        }}
      >
        {/* Aktiviti Mentah */}
        <div
          style={{
            border: "1px solid #ddd",
            borderRadius: 12,
            padding: 12,
            background: "#fff",
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
            <strong>Aktiviti Mentah ({filteredCards.length})</strong>
            <span style={{ fontSize: 12, color: "#888" }}>
              (Total: {rawCards.length})
            </span>
          </div>

          <div
            style={{
              marginTop: 10,
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            {filteredCards.length === 0 ? (
              <div style={{ fontSize: 13, color: "#666" }}>
                Tiada aktiviti untuk filter/carian ini.
                <div style={{ marginTop: 8, color: "#888" }}>
                  Jika kad belum muncul, semak Session dan pastikan Live Board sudah ada kad.: klik <strong>AI Cluster (Preview)</strong>.
                </div>
              </div>
            ) : null}

            {filteredCards.map((card) => {
              const cuId = assignments[String(card.id)] || "";
              const cuTitle = cuId
                ? cus.find((x) => x.id === cuId)?.title || ""
                : "";
              const isAssigned = Boolean(cuId);

              return (
                <div
                  key={card.id}
                  style={{
                    border: "1px solid #eee",
                    borderRadius: 12,
                    padding: 10,
                    background: "#fff",
                  }}
                >
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>
                    {card.activity}
                  </div>

                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      flexWrap: "wrap",
                    }}
                  >
                    <span
                      style={{
                        fontSize: 12,
                        padding: "3px 8px",
                        borderRadius: 999,
                        border: "1px solid #ddd",
                        background: isAssigned ? "#e8f5e9" : "#fff7e6",
                      }}
                    >
                      {isAssigned ? "ASSIGNED" : "UNASSIGNED"}
                    </span>

                    <span style={{ fontSize: 12, color: "#888" }}>
                      ID: <code>{card.id}</code>
                    </span>

                    {cuTitle ? (
                      <span style={{ fontSize: 12, color: "#666" }}>
                        → <strong>{cuTitle}</strong>
                      </span>
                    ) : null}
                  </div>

                  <div style={{ marginTop: 8 }}>
                    <select
                      value={cuId || ""}
                      onChange={(e) => setCardAssignment(card.id, e.target.value)}
                      style={{
                        width: "100%",
                        padding: "9px 10px",
                        borderRadius: 10,
                        border: "1px solid #ccc",
                        background: "#fff",
                      }}
                    >
                      <option value="">— Unassigned —</option>
                      {cuOptions.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.title}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Senarai CU */}
        <div
          style={{
            border: "1px solid #ddd",
            borderRadius: 12,
            padding: 12,
            background: "#fff",
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
            <strong>Senarai CU ({cus.length})</strong>
            <button
              onClick={createNewCU}
              style={{
                padding: "6px 10px",
                borderRadius: 10,
                border: "1px solid #ccc",
                background: "#fff",
                cursor: "pointer",
                fontSize: 12,
              }}
            >
              + CU Baru
            </button>
          </div>

          {cus.length === 0 ? (
            <div style={{ marginTop: 10, fontSize: 13, color: "#666" }}>
              Belum ada CU. Klik <strong>Apply AI</strong> atau{" "}
              <strong>+ CU Baru</strong> untuk mula.
            </div>
          ) : null}

          <div
            style={{
              marginTop: 10,
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            {cus.map((cu) => {
              const count = Object.values(assignments || {}).filter(
                (x) => x === cu.id
              ).length;

              return (
                <div
                  key={cu.id}
                  style={{
                    border: "1px solid #eee",
                    borderRadius: 12,
                    padding: 10,
                    background: "#fff",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 8,
                      alignItems: "center",
                    }}
                  >
                    <div style={{ fontWeight: 800 }}>
                      {cu.title}{" "}
                      <span style={{ fontSize: 12, color: "#666" }}>
                        ({count} aktiviti)
                      </span>
                    </div>
                    <button
                      onClick={() => deleteCU(cu.id)}
                      style={{
                        padding: "6px 10px",
                        borderRadius: 10,
                        border: "1px solid #ff4d4f",
                        background: "#fff",
                        color: "#ff4d4f",
                        cursor: "pointer",
                        fontSize: 12,
                      }}
                    >
                      Delete
                    </button>
                  </div>

                  <div style={{ marginTop: 8, fontSize: 12, color: "#666" }}>
                    Rename CU
                  </div>
                  <input
                    value={cu.title}
                    onChange={(e) => renameCU(cu.id, e.target.value)}
                    style={{
                      width: "100%",
                      padding: "9px 10px",
                      borderRadius: 10,
                      border: "1px solid #ccc",
                    }}
                  />
                </div>
              );
            })}
          </div>
        </div>

        {/* Butiran */}
        <div
          style={{
            border: "1px solid #ddd",
            borderRadius: 12,
            padding: 12,
            background: "#fff",
          }}
        >
          <strong>Butiran</strong>

          <div style={{ marginTop: 10, fontSize: 13, color: "#555" }}>
            Klik “AI Cluster (Preview)” untuk dapatkan AI result. Lepas itu pilih
            Apply:
            <ul style={{ marginTop: 8 }}>
              <li>
                <strong>Merge</strong>: tambah CU & assign yang belum di-assign
                (tak override manual).
              </li>
              <li>
                <strong>Replace</strong>: reset semua CU & assignment ikut AI.
              </li>
            </ul>
            Lepas apply, anda boleh ubah manual melalui dropdown aktiviti.
          </div>

          <div style={{ marginTop: 12, borderTop: "1px solid #eee", paddingTop: 12 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                onClick={() => {
                  const payload = buildExportJson();
                  copyToClipboard(JSON.stringify(payload, null, 2));
                }}
                disabled={aiCards.length === 0}
                style={{
                  padding: "8px 12px",
                  borderRadius: 10,
                  border: "1px solid #ccc",
                  background: "#fff",
                  cursor: aiCards.length === 0 ? "not-allowed" : "pointer",
                  fontSize: 12,
                }}
              >
                Copy Export JSON
              </button>

              <button
                onClick={() => {
                  if (!data) return alert("Belum ada AI result.");
                  copyToClipboard(JSON.stringify(data, null, 2));
                }}
                disabled={!data}
                style={{
                  padding: "8px 12px",
                  borderRadius: 10,
                  border: "1px solid #ccc",
                  background: "#fff",
                  cursor: !data ? "not-allowed" : "pointer",
                  fontSize: 12,
                }}
              >
                Copy RAW AI JSON
              </button>
            </div>

            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 12, color: "#666", marginBottom: 6 }}>
                Export JSON preview (untuk CPC/CP)
              </div>
              <pre
                style={{
                  whiteSpace: "pre-wrap",
                  border: "1px solid #eee",
                  borderRadius: 12,
                  padding: 10,
                  maxHeight: 360,
                  overflow: "auto",
                  background: "#fafafa",
                  fontSize: 12,
                }}
              >
                {JSON.stringify(buildExportJson(), null, 2)}
              </pre>
            </div>

            {data ? (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 12, color: "#666", marginBottom: 6 }}>
                  AI Cluster Preview (raw)
                </div>
                <pre
                  style={{
                    whiteSpace: "pre-wrap",
                    border: "1px solid #eee",
                    borderRadius: 12,
                    padding: 10,
                    maxHeight: 260,
                    overflow: "auto",
                    background: "#fafafa",
                    fontSize: 12,
                  }}
                >
                  {JSON.stringify(data, null, 2)}
                </pre>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* Footer tips */}
      <div style={{ marginTop: 12, fontSize: 12, color: "#777" }}>
        Tip: Jika “Unassigned” banyak, cuba turunkan <code>similarityThreshold</code>{" "}
        (contoh 0.55 → 0.50) atau naikkan <code>maxClusters</code>.
      </div>
    </div>
  );
}
