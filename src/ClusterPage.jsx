import React, { useMemo, useState } from "react";

const API_BASE = import.meta.env.VITE_API_BASE || "https://dacum-backend.onrender.com";

export default function ClusterPage() {
  const apiBase = useMemo(() => {
    // Pastikan domain betul
    const v = String(API_BASE || "").trim();
    if (!v) return "https://dacum-backend.onrender.com";
    return v.replace("onrenderer.com", "onrender.com");
  }, []);

  // =========================
  // Session + tuning params
  // =========================
  const [sessionId, setSessionId] = useState("Masjid");

  const [similarityThreshold, setSimilarityThreshold] = useState(0.55);
  const [minClusterSize, setMinClusterSize] = useState(2);
  const [maxClusters, setMaxClusters] = useState(12);

  // =========================
  // Data + UI state
  // =========================
  const [data, setData] = useState(null); // raw response from backend
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all"); // all | assigned | unassigned

  // =========================
  // "Manual clustering" state
  // CU list + assignments
  // =========================
  const [cus, setCus] = useState([]); // [{ id, title, notes }]
  const [assignments, setAssignments] = useState({}); // { [cardId]: cuId }

  function slugify(s) {
  return String(s || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function applyAIResult(ai) {
  const clusters = Array.isArray(ai?.clusters) ? ai.clusters : [];
  if (!clusters.length) {
    alert("Tiada cluster dalam AI result.");
    return;
  }

  // 1) bina CU mapping: title -> cuId
  setCus((prevCus) => {
    const nextCus = Array.isArray(prevCus) ? [...prevCus] : [];
    const titleToId = new Map(nextCus.map((c) => [String(c.title || "").trim(), c.id]));

    for (const cl of clusters) {
      const title = String(cl?.title || "").trim();
      if (!title) continue;

      if (!titleToId.has(title)) {
        const newCu = {
          id: `ai-${slugify(title)}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
          title,
          notes: "Auto-generated dari AI Preview",
        };
        nextCus.push(newCu);
        titleToId.set(title, newCu.id);
      }
    }

    // simpan mapping untuk step assignment (guna window temp)
    window.__aiTitleToCuId = titleToId;
    return nextCus;
  });

  // 2) assign cardIds -> cuId
  setAssignments((prev) => {
    const next = { ...(prev || {}) };

    // guna mapping yang baru dibina (fallback: bina semula dari cus jika perlu)
    const titleToId =
      window.__aiTitleToCuId instanceof Map ? window.__aiTitleToCuId : new Map();

    const alreadyAssigned = new Set(Object.keys(next).map((k) => String(k)));

    for (const cl of clusters) {
      const title = String(cl?.title || "").trim();
      const cuId = titleToId.get(title);
      if (!cuId) continue;

      const ids = Array.isArray(cl?.cardIds) ? cl.cardIds : [];
      for (const rawId of ids) {
        const cardId = String(rawId);

        // Kalau cardId dah ada assignment (manual / dari cluster lain), jangan override
        if (alreadyAssigned.has(cardId)) continue;

        next[cardId] = cuId;
        alreadyAssigned.add(cardId);
      }
    }

    // cleanup
    try { delete window.__aiTitleToCuId; } catch {}

    return next;
  });

  alert("AI auto-assign siap. Sila semak & betulkan jika perlu.");
}
  
  // =========================
  // Helpers
  // =========================
  const clusters = Array.isArray(data?.clusters) ? data.clusters : [];
  const params = data?.params || {};
  const meta = data?.meta || {};

  // Build "cards" list from AI response (best effort)
  // - Backend preview returns clusters[].items = [{id,name}]
  // - Also returns unassigned = [id,...] but without names
  // So: our "Aktiviti Mentah" will primarily be from clustered items.
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
          // Backend preview tak bagi timestamp; jadi kita kosongkan
          time: "",
        });
      }
    }

    // Optional: add placeholders for unassigned ids (no name available)
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

  const cuOptions = useMemo(() => {
    return cus.map((c) => ({ id: c.id, title: c.title }));
  }, [cus]);

  const assignedCount = useMemo(() => {
    const keys = Object.keys(assignments || {});
    let n = 0;
    for (const k of keys) if (assignments[k]) n++;
    return n;
  }, [assignments]);

  const filteredCards = useMemo(() => {
    const q = String(query || "").toLowerCase().trim();

    return aiCards.filter((c) => {
      const isAssigned = Boolean(assignments[String(c.id)]);
      if (filter === "assigned" && !isAssigned) return false;
      if (filter === "unassigned" && isAssigned) return false;

      if (!q) return true;
      return String(c.activity || "").toLowerCase().includes(q);
    });
  }, [aiCards, assignments, filter, query]);

  function safeTitle(s) {
    const t = String(s || "").trim();
    return t || "CU";
  }

  function buildExportJson() {
    // Format yang mudah untuk CPC/CP nanti:
    // {
    //   sessionId,
    //   generatedAt,
    //   cus: [{cuId, title}],
    //   assignments: [{cardId, activity, cuId, cuTitle}],
    //   rawAI: data
    // }
    const cuMap = new Map(cus.map((c) => [c.id, c.title]));
    const rows = aiCards.map((c) => {
      const cuId = assignments[String(c.id)] || "";
      return {
        cardId: String(c.id),
        activity: String(c.activity || ""),
        cuId,
        cuTitle: cuId ? (cuMap.get(cuId) || "") : "",
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

  // =========================
  // Actions
  // =========================
  async function loadCluster() {
    const sid = String(sessionId || "").trim();
    if (!sid) {
      setErr("Sila isi Session ID dahulu.");
      setData(null);
      return;
    }

    setLoading(true);
    setErr("");

    try {
      const res = await fetch(`${apiBase}/api/cluster/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: sid,
          similarityThreshold: Number(similarityThreshold),
          minClusterSize: Number(minClusterSize),
          maxClusters: Number(maxClusters),
        }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status}: ${text || "Request gagal. Sila semak backend."}`);
      }

      const json = await res.json();
      setData(json);
      alert("AI clustering berjaya.");
    } catch (e) {
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

  function handleApplyAI() {
    // Apply AI -> bina CU dari clusters + assign cardIds
    if (!data || !Array.isArray(data.clusters) || data.clusters.length === 0) {
      alert("Tiada AI result untuk apply.");
      return;
    }

    // Backend preview (graph) biasanya return: clusters[].theme + items[]
    // Tapi screenshot anda (LLM style) return: clusters[].title + cardIds[]
    // Kita support dua-dua.
    const rawClusters = data.clusters;

    const newCus = rawClusters.map((cl, idx) => {
      const title = safeTitle(cl?.theme || cl?.title || `CU ${idx + 1}`);
      return {
        id: `ai-cu-${Date.now()}-${idx}`,
        title,
        notes: "Auto (AI)",
      };
    });

    const titleToCuId = new Map(newCus.map((c) => [c.title, c.id]));
    const nextAssignments = {};

    rawClusters.forEach((cl, idx) => {
      const title = safeTitle(cl?.theme || cl?.title || `CU ${idx + 1}`);
      const cuId = titleToCuId.get(title) || newCus[idx].id;

      // Case A: items[] (graph preview)
      const items = Array.isArray(cl?.items) ? cl.items : [];
      if (items.length) {
        items.forEach((it) => {
          const id = it?.id;
          if (id == null) return;
          nextAssignments[String(id)] = cuId;
        });
        return;
      }

      // Case B: cardIds[] (LLM style)
      const cardIds = Array.isArray(cl?.cardIds) ? cl.cardIds : [];
      cardIds.forEach((id) => {
        if (id == null) return;
        nextAssignments[String(id)] = cuId;
      });
    });

    setCus(newCus);
    setAssignments(nextAssignments);

    alert("AI result berjaya di-apply (CU + assignment).");
  }

  function setCardAssignment(cardId, cuId) {
    const key = String(cardId);
    setAssignments((prev) => ({
      ...(prev || {}),
      [key]: cuId || "",
    }));
  }

  function renameCU(cuId, newTitle) {
    setCus((prev) =>
      prev.map((c) => {
        if (c.id !== cuId) return c;
        return { ...c, title: safeTitle(newTitle) };
      })
    );
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
          Total: <strong>{aiCards.length}</strong> | Assigned: <strong>{assignedCount}</strong> | Unassigned:{" "}
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
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end" }}>
          <div style={{ minWidth: 220 }}>
            <div style={{ fontSize: 12, marginBottom: 6 }}>Tukar Session</div>
            <input
              value={sessionId}
              onChange={(e) => setSessionId(e.target.value)}
              placeholder="contoh: Masjid"
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 8,
                border: "1px solid #ccc",
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") loadCluster();
              }}
            />
          </div>

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
  onClick={handleApplyAI}
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
  title="Apply AI result → auto assign CU ikut cardIds"
>
  Apply AI Result
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
                  (params: thr={params.similarityThreshold ?? similarityThreshold}, min=
                  {params.minClusterSize ?? minClusterSize})
                </span>
              </>
            ) : (
              <span>Tip: Klik “AI Cluster (Preview)” → “Apply AI Result” → semak/ubah manual → Export JSON</span>
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
            AI Preview: totalCards=<strong>{data.totalCards ?? "-"}</strong> | clusters=<strong>{meta.totalClusters ?? clusters.length}</strong> | clusteredItems=<strong>{meta.totalClusteredItems ?? "-"}</strong> | unassigned=<strong>{meta.unassignedCount ?? (data.unassigned?.length ?? 0)}</strong>
          </div>
        ) : null}
      </div>

      {/* Main layout: Aktiviti Mentah | Senarai CU | Butiran */}
      <div style={{ display: "grid", gridTemplateColumns: "420px 320px 1fr", gap: 12, alignItems: "start" }}>
        {/* Aktiviti Mentah */}
        <div
          style={{
            border: "1px solid #ddd",
            borderRadius: 12,
            padding: 12,
            background: "#fff",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
            <strong>Aktiviti Mentah ({filteredCards.length})</strong>
            <span style={{ fontSize: 12, color: "#888" }}>
              (Total: {aiCards.length})
            </span>
          </div>

          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 10 }}>
            {filteredCards.length === 0 ? (
              <div style={{ fontSize: 13, color: "#666" }}>
                Tiada aktiviti untuk filter/carian ini.
                <div style={{ marginTop: 8, color: "#888" }}>
                  Jika belum jana AI: klik <strong>AI Cluster (Preview)</strong>.
                </div>
              </div>
            ) : null}

            {filteredCards.map((card) => {
              const cuId = assignments[String(card.id)] || "";
              const cuTitle = cuId ? (cus.find((x) => x.id === cuId)?.title || "") : "";
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
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>{card.activity}</div>

                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
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
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
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
              Belum ada CU. Klik <strong>Apply AI Result</strong> atau <strong>+ CU Baru</strong> untuk mula.
            </div>
          ) : null}

          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 10 }}>
            {cus.map((cu) => {
              const count = Object.values(assignments || {}).filter((x) => x === cu.id).length;

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
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                    <div style={{ fontWeight: 800 }}>
                      {cu.title}{" "}
                      <span style={{ fontSize: 12, color: "#666" }}>({count} aktiviti)</span>
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

                  <div style={{ marginTop: 8, fontSize: 12, color: "#666" }}>Rename CU</div>
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

        {/* Butiran (AI raw + export preview) */}
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
            Klik “AI Cluster (Preview)” untuk dapatkan AI result. Klik “Apply AI Result” untuk bina CU & assignment automatik.
            Lepas itu anda boleh ubah secara manual melalui dropdown aktiviti.
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
        Tip: Jika “Unassigned” banyak, cuba turunkan <code>similarityThreshold</code> (contoh 0.55 → 0.50) atau naikkan <code>maxClusters</code>.
      </div>
    </div>
  );
}
