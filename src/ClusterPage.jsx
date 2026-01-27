import React, { useEffect, useMemo, useState } from "react";
console.log("ClusterPage.jsx LOADED ✅ v2026-01-27-CLUSTER-FALLBACK-1");

const API_BASE =
  (import.meta?.env?.VITE_API_BASE && String(import.meta.env.VITE_API_BASE)) ||
  "https://dacum-backend.onrender.com";

function normalizeClusterResult(raw) {
  if (!raw) return [];

  // 1) Dapatkan "container" yang paling munasabah
  const container =
    raw.clusters ??
    raw.result ??
    raw.data ??
    raw.output ??
    raw.payload ??
    raw;

  // Helper: extract text
  const getText = (x) =>
    String(
      x?.activity ??
        x?.name ??
        x?.text ??
        x?.title ??
        x?.wa ??
        x?.waTitle ??
        x?.card ??
        x ??
        ""
    ).trim();

  // Helper: extract list array
  const pickList = (c) => {
    return (
      c?.items ??
      c?.cards ??
      c?.list ??
      c?.activities ??
      c?.members ??
      c?.children ??
      c?.cardsInCluster ??
      c?.membersCards ??
      []
    );
  };

  // 2) Jika backend bagi array cluster
  if (Array.isArray(container)) {
    return container.map((c, idx) => {
      const title = String(
        c?.title ?? c?.name ?? c?.clusterTitle ?? c?.label ?? `Cluster ${idx + 1}`
      ).trim();

      const list = pickList(c);
      const arr = Array.isArray(list) ? list : [];

      const items = arr
        .map((x, j) => ({
          id: String(x?.id ?? x?.cardId ?? x?.waId ?? `${idx}-${j}`),
          text: getText(x),
        }))
        .filter((it) => it.text); // buang kosong

      return { id: String(c?.id ?? `c${idx + 1}`), title, items };
    });
  }

  // 3) Jika backend bagi object map { "Cluster": [...] }
  if (container && typeof container === "object") {
    // special: kadang backend simpan dalam raw.groups atau raw.clusterMap
    const obj =
      container.groups ??
      container.clusterMap ??
      container.map ??
      container;

    if (obj && typeof obj === "object" && !Array.isArray(obj)) {
      const entries = Object.entries(obj);

      // jika entries kelihatan macam {generatedAt, sessionId} — skip metadata
      const useful = entries.filter(([k, v]) => Array.isArray(v));
      if (useful.length) {
        return useful.map(([k, arr], idx) => ({
          id: `c${idx + 1}`,
          title: String(k).trim(),
          items: (Array.isArray(arr) ? arr : [])
            .map((x, j) => ({
              id: String(x?.id ?? x?.cardId ?? x?.waId ?? `${idx}-${j}`),
              text: getText(x),
            }))
            .filter((it) => it.text),
        }));
      }
    }
  }

  return [];
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
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.error || `GET ${path} -> ${res.status}`);
    return json;
  }

  async function apiPost(path, body) {
    const res = await fetch(`${apiBase}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.error || `POST ${path} -> ${res.status}`);
    return json;
  }

  async function loadResult() {
    const sid = String(sessionId || "").trim();
    if (!sid) return;

    setErr("");
    try {
      // ✅ Endpoint biasa kita guna: /api/cluster/result/:sessionId
      const out = await apiGet(`/api/cluster/result/${encodeURIComponent(sid)}`);
      setRawResult(out);
      const normalized = normalizeClusterResult(out);
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

  try {
    // Cuba A: /api/cluster/run/:sessionId
    try {
      await apiPost(`/api/cluster/run/${encodeURIComponent(sid)}`, {});
    } catch (e1) {
      const msg1 = String(e1?.message || e1);

      // Jika 404, cuba B: /api/cluster/run (body)
      if (/404\b/.test(msg1)) {
        await apiPost(`/api/cluster/run`, { sessionId: sid });
      } else {
        throw e1;
      }
    }

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
    const sid = String(sessionId || "").trim();
    if (!sid) return alert("Sila isi Session dulu.");

    if (!agreed) {
      return alert(
        "Sila tekan 'Agreed' dahulu selepas anda selesai edit clustering."
      );
    }

    setBusy(true);
    setErr("");
    try {
      // ✅ Penting: hantar hasil edit ke backend supaya merge ikut edit user
      // Anda perlukan backend endpoint yang menerima payload clustering.
      // Saya guna /api/cluster/apply/:sessionId (ubah jika berbeza).
      await apiPost(`/api/cluster/apply/${encodeURIComponent(sid)}`, {
        clusters,
        source: "manual_edit_before_merge",
      });

      alert("Apply AI (Merge) berjaya. Sila semak output seterusnya.");
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
      const next = prev.map((c) => ({ ...c, items: [...c.items] }));
      const from = next.find((c) => c.id === fromClusterId);
      const to = next.find((c) => c.id === toClusterId);
      if (!from || !to) return prev;

      const idx = from.items.findIndex((x) => x.id === itemId);
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

    // optional: validate tajuk cluster tak kosong
    const hasEmptyTitle = clusters.some((c) => !String(c.title || "").trim());
    if (hasEmptyTitle) {
      alert("Sila pastikan semua tajuk cluster diisi sebelum Agreed.");
      return;
    }

    setAgreed(true);
  }

  // load last result on mount (optional)
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

        {/* 1) Rename button */}
        <button
          onClick={runClustering}
          disabled={busy || aiLoading}
          style={{ height: 36 }}
        >
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

      {err ? (
        <div style={{ marginTop: 10, color: "#b91c1c" }}>
          Error: {err}
        </div>
      ) : null}

      {/* 2) ruang edit sebelum merge */}
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

            {/* 3) Agreed gate */}
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
          Anda boleh: <b>ubah tajuk cluster</b> dan <b>pindahkan aktiviti</b>.
          Selepas selesai, tekan <b>Agreed</b> untuk lock sebelum <b>Apply AI (Merge)</b>.
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
                    disabled={agreed} // bila agreed, lock edit
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
                    — <b>{c.items.length}</b> aktiviti
                  </div>
                </div>

                <button
                  onClick={() => removeEmptyCluster(c.id)}
                  disabled={agreed || c.items.length > 0}
                  title={
                    c.items.length > 0
                      ? "Hanya boleh buang cluster yang kosong"
                      : "Buang cluster kosong"
                  }
                  style={{ height: 32 }}
                >
                  Remove (empty)
                </button>
              </div>

              <div style={{ marginTop: 10 }}>
                {c.items.map((it) => (
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
                    <div style={{ flex: 1 }}>
                      • {it.text || <i>(tiada teks)</i>}
                    </div>

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

                {c.items.length === 0 ? (
                  <div style={{ marginTop: 8, opacity: 0.75 }}>
                    (Cluster kosong)
                  </div>
                ) : null}
              </div>
            </div>
          ))
        )}
      </div>

      {/* debug info kecil */}
      {rawResult?.generatedAt ? (
        <div style={{ marginTop: 10, fontSize: 12, opacity: 0.75 }}>
          generatedAt: {String(rawResult.generatedAt)}
        </div>
      ) : null}
    </div>
  );
}
