import { useEffect, useState } from "react";

export default function ClusterView() {
  const [result, setResult] = useState(null);

  async function runCluster() {
    const res = await fetch(
      "https://dacum-backend.onrender.com/api/cluster/preview",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: "dacum-test-ai-1",
          similarityThreshold: 0.55,
          minClusterSize: 2,
        }),
      }
    );
    const data = await res.json();
    console.log("AI Cluster Result:", data);
    setResult(data);
  }

  return (
    <div style={{ padding: 24 }}>
      <h2>AI Cluster View</h2>
      <button onClick={runCluster}>Run AI Cluster</button>

      {result && (
        <pre style={{ marginTop: 20 }}>
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
}

