import React, { useEffect, useState } from "react";

const API_BASE =
  import.meta.env.VITE_API_BASE || "https://dacum-backend.onrender.com";

export default function ClusterPage() {
  const [sessionId, setSessionId] = useState("dacum-test-ai-1");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  async function loadCluster() {
    setLoading(true);
    setErr("");
    try {
      const res = await fetch(`${API_BASE}/api/cluster/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          similarityThreshold: 0.55,
          minClusterSize: 2,
        }),
      });
      const json = await res.json();
      setData(json);
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: 20 }}>
      <h2>AI Cluster View</h2>

      <div style={{ marginBottom: 10 }}>
        <input
          value={sessionId}
          onChange={(e) => setSessionId(e.target.value)}
          placeholder="Session ID"
        />
        <button onClick={loadCluster} style={{ marginLeft: 10 }}>
          Jana Kluster
        </button>
      </div>

      {loading && <p>⏳ Menjana kluster...</p>}
      {err && <p style={{ color: "red" }}>{err}</p>}

      {data?.clusters?.map((c) => (
        <div
          key={c.clusterId}
          style={{
            border: "1px solid #ccc",
            padding: 10,
            marginBottom: 10,
          }}
        >
          <strong>{c.theme}</strong> ({c.count}) —{" "}
          <em>{c.strength}</em>
          <ul>
            {c.items.map((it) => (
              <li key={it.id}>{it.name}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

