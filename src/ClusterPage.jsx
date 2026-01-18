import React, { useMemo, useState } from "react";

const API_BASE =
  import.meta.env.VITE_API_BASE || "https://dacum-backend.onrenderer.com";

// NOTE: Anda guna onrender.com sebelum ini. Pastikan domain betul.
// Jika betul ialah "https://dacum-backend.onrender.com", tukar balik.
const FALLBACK_API_BASE = "https://dacum-backend.onrender.com";

export default function ClusterPage() {
  const apiBase = useMemo(() => {
    // Kalau VITE_API_BASE kosong & API_BASE tersalah domain, fallback:
    if (!API_BASE || API_BASE.includes("onrenderer.com")) return FALLBACK_API_BASE;
    return API_BASE;
  }, []);

  const [sessionId, setSessionId] = useState("");

  // Tuning params (boleh ubah terus di UI)
  const [similarityThreshold, setSimilarityThreshold] = useState(0.55);
  const [minClusterSize, setMinClusterSize] = useState(2);
  const [maxClusters, setMaxClusters] = useState(12);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

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

      // Handle error HTTP dengan mesej yang jelas
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(
          `HTTP ${res.status}: ${text || "Request gagal. Sila semak backend."}`
        );
      }

      const json = await res.json();
      setData(json);
    } catch (e) {
      setErr(e?.message ? String(e.message) : String(e));
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  const clusters = Array.isArray(data?.clusters) ? data.clusters : [];
  const meta = data?.meta || {};
  const params = data?.params || {};

  return (
    <div style={{ padding: 20, maxWidth: 980, margin: "0 auto" }}>
      <h2 style={{ marginTop: 0 }}>AI Cluster View</h2>

      <div
        style={{
          border: "1px solid #ddd",
          borderRadius: 10,
          padding: 12,
          marginBottom: 12,
        }}
      >
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <div style={{ minWidth: 280 }}>
            <div style={{ fontSize: 12, marginBottom: 6 }}>Session ID</div>
            <input
              value={sessionId}
              onChange={(e) => setSessionId(e.target.value)}
              placeholder="contoh: dacum-masjid-v2"
              onKeyDown={(e) => {
                if (e.key === "Enter") loadCluster();
              }}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 8,
                border: "1px solid #ccc",
              }}
            />
          </div>

          <div style={{ minWidth: 200 }}>
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

          <div style={{ display: "flex", alignItems: "end", gap: 10 }}>
            <button
              onClick={loadCluster}
              disabled={loading}
              style={{
                padding: "10px 14px",
                borderRadius: 8,
                border: "1px solid #111",
                background: loading ? "#eee" : "#111",
                color: loading ? "#333" : "#fff",
                cursor: loading ? "not-allowed" : "pointer",
              }}
            >
              {loading ? "Menjana..." : "Jana Kluster"}
            </button>

            <button
              onClick={() => {
                setData(null);
                setErr("");
              }}
              disabled={loading}
              style={{
                padding: "10px 14px",
                borderRadius: 8,
                border: "1px solid #ccc",
                background: "#fff",
                cursor: loading ? "not-allowed" : "pointer",
              }}
            >
              Reset Paparan
            </button>
          </div>
        </div>

        <div style={{ marginTop: 10, fontSize: 12, color: "#555" }}>
          API: <code>{apiBase}</code>
          {data?.generatedAt ? (
            <>
              {" "}
              | Generated: <code>{data.generatedAt}</code>
            </>
          ) : null}
        </div>

        {data ? (
          <div style={{ marginTop: 8, fontSize: 12, color: "#555" }}>
            Total Cards: <strong>{data.totalCards ?? "-"}</strong> | Clusters:{" "}
            <strong>{meta.totalClusters ?? clusters.length ?? 0}</strong> | Clustered Items:{" "}
            <strong>{meta.totalClusteredItems ?? "-"}</strong> | Unassigned:{" "}
            <strong>{meta.unassignedCount ?? (data.unassigned?.length ?? 0)}</strong>
            {" "}
            <span style={{ color: "#888" }}>
              (params: thr={params.similarityThreshold ?? similarityThreshold}, min={params.minClusterSize ?? minClusterSize})
            </span>
          </div>
        ) : null}
      </div>

      {err ? (
        <div
          style={{
            border: "1px solid #f5c2c7",
            background: "#f8d7da",
            color: "#842029",
            padding: 10,
            borderRadius: 10,
            marginBottom: 12,
          }}
        >
          {err}
        </div>
      ) : null}

      {!loading && data && clusters.length === 0 ? (
        <div
          style={{
            border: "1px solid #ddd",
            borderRadius: 10,
            padding: 12,
            color: "#333",
          }}
        >
          Tiada kluster yang terbentuk. Cuba:
          <ul style={{ marginTop: 8 }}>
            <li>Turunkan <code>similarityThreshold</code> (contoh 0.55 → 0.50)</li>
            <li>Pastikan card dalam session ada <code>activity</code> atau <code>name</code> yang terisi</li>
          </ul>
        </div>
      ) : null}

      {clusters.map((c) => (
        <div
          key={c.clusterId}
          style={{
            border: "1px solid #ddd",
            borderRadius: 12,
            padding: 12,
            marginBottom: 12,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <div>
              <strong style={{ fontSize: 16 }}>{c.theme || c.title || c.clusterId}</strong>{" "}
              <span style={{ color: "#666" }}>({c.count ?? (c.items?.length ?? 0)})</span>
            </div>
            <div style={{ color: "#666" }}>
              <em>{c.strength || "-"}</em>
            </div>
          </div>

          <ul style={{ marginTop: 10 }}>
            {(Array.isArray(c.items) ? c.items : []).map((it) => (
              <li key={it.id ?? it.name}>{it.name}</li>
            ))}
          </ul>
        </div>
      ))}

      {Array.isArray(data?.unassigned) && data.unassigned.length > 0 ? (
        <div
          style={{
            border: "1px solid #eee",
            borderRadius: 12,
            padding: 12,
            marginTop: 14,
          }}
        >
          <strong>Unassigned ({data.unassigned.length})</strong>
          <div style={{ fontSize: 12, color: "#666", marginTop: 6 }}>
            Ini ialah ID card yang belum masuk mana-mana cluster (biasanya sebab similarity rendah).
          </div>
          <pre style={{ whiteSpace: "pre-wrap", marginTop: 10 }}>
            {JSON.stringify(data.unassigned, null, 2)}
          </pre>
        </div>
      ) : null}
    </div>
  );
}
