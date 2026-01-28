import React, { useEffect, useMemo, useState } from "react";

const API_BASE =
  (import.meta?.env?.VITE_API_BASE && String(import.meta.env.VITE_API_BASE)) ||
  "https://dacum-backend.onrender.com";

/**
 * Ambil query param daripada:
 * 1) window.location.search  -> ?session=Office-v3
 * 2) window.location.hash    -> #/cluster?session=Office-v3
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
  const hs = new URLSearchParams(qs);
  return hs.get(name) || "";
}

async function apiGet(path) {
  const url = `${API_BASE}${path}`;
  const r = await fetch(url, { method: "GET" });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`${r.status} ${r.statusText}${t ? ` - ${t}` : ""}`);
  }
  return r.json();
}

async function apiPost(path, body) {
  const url = `${API_BASE}${path}`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`${r.status} ${r.statusText}${t ? ` - ${t}` : ""}`);
  }
  return r.json();
}

function safeText(x) {
  return String(x || "").trim();
}

function buildCardMap(cards) {
  const map = {};
  (cards || []).forEach((c) => {
    const id = c?.id;
    if (!id) return;
    map[id] = {
      id,
      // backend kad biasanya simpan sebagai activity / text / name (kita cover semua)
      text: safeText(c.activity || c.text || c.name || c.title),
      ts: c.ts || c.createdAt || c.at || null,
      raw: c,
    };
  });
  return map;
}

function normalizeClustersWithCardMap(result, cardMap) {
  const clusters = Array.isArray(result?.clusters) ? result.clusters : [];

  return clusters.map((cl, idx) => {
    const title = safeText(cl?.title) || `Cluster ${idx + 1}`;
    const cardIds = Array.isArray(cl?.cardIds) ? cl.cardIds : [];
    const cards = cardIds
      .map((id) => cardMap[id])
      .filter(Boolean)
      .map((x) => ({ id: x.id, text: x.text, ts: x.ts }));

    return {
      title,
      cardIds,
      cards,
    };
  });
}

export default function ClusterPage() {
  const [sessionId, setSessionId] = useState(getQueryParam("session") || "");
  const [busy, setBusy] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [err, setErr] = useState("");

  // UI data
  const [clusters, setClusters] = useState([]);
  const [rawResult, setRawResult] = useState(null);
  const [agreed, setAgreed] = useState(false);

  const sidTrim = useMemo(() => String(sessionId || "").trim(), [sessionId]);

  useEffect(() => {
    // auto-load bila buka page (kalau session ada)
    if (!sidTrim) return;
    loadResult();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sidTrim]);

  async function loadSessionCards(sid) {
    // ✅ server.js baharu guna: GET /api/cards/:sessionId
    // fallback disimpan untuk kes repo lama.
    const tries = [
      `/api/cards/${encodeURIComponent(sid)}`,
      // legacy fallbacks (jika ada versi lama backend)
      `/api/session/cards/${encodeURIComponent(sid)}`,
      `/api/session/${encodeURIComponent(sid)}/cards`,
      `/api/session/cards?sessionId=${encodeURIComponent(sid)}`,
    ];

    let last = "";
    for (const path of tries) {
      try {
        console.log("LOAD CARDS TRY:", path);
        const out = await apiGet(path);

        // backend boleh pulang { ok:true, items:[...] } atau terus [...]
        const items = Array.isArray(out) ? out : out?.items;
        if (Array.isArray(items)) return items;

        // kalau format pelik, kita teruskan cuba endpoint lain
        last = `Format response tak dijangka (${path})`;
      } catch (e) {
        last = String(e?.message || e);
        console.warn("LOAD CARDS FAIL:", path, last);
      }
    }

    throw new Error(last || "Gagal load cards.");
  }

  async function loadResult() {
    const sid = String(sessionId || "").trim();
    if (!sid) return;

    setErr("");

    // 1) Ambil cluster result (kalau belum ada, server akan 404)
    let out = null;
    try {
      const path = `/api/cluster/result/${encodeURIComponent(sid)}`;
      console.log("LOAD RESULT:", path);
      out = await apiGet(path);
      console.log("LOAD RESULT OK:", out);
    } catch (e) {
      const msg = String(e?.message || e || "");

      // 404 = normal: memang belum ada clustering lagi
      if (msg.includes("404")) {
        console.warn("NO CLUSTER RESULT YET:", msg);
        setClusters([]);
        setRawResult(null);
        setAgreed(false);
        setErr("");
        return;
      }

      // selain 404, anggap error sebenar
      setErr(msg);
      return;
    }

    // 2) Normalize result (padankan cardIds -> teks kad)
    try {
      const cards = await loadSessionCards(sid);
      const cardMap = buildCardMap(cards);
      const normalized = normalizeClustersWithCardMap(out, cardMap);

      setRawResult(out);
      setClusters(normalized);
      // server.js anda tak semestinya ada `agreed`, jadi default false
      setAgreed(!!out?.agreed || false);
    } catch (e) {
      setErr(String(e?.message || e));
    }
  }

  async function runClustering() {
    const sid = String(sessionId || "").trim();
    if (!sid) {
      alert("Sila isi Session dulu.");
      return;
    }

    setBusy(true);
    setAiLoading(true);
    setErr("");

    try {
      console.log("RUN CLUSTER:", sid);

      // ✅ server.js baharu: POST /api/cluster/run dengan body { sessionId }
      await apiPost(`/api/cluster/run`, { sessionId: sid });

      // lepas run, reload result
      await loadResult();
    } catch (e) {
      const msg = String(e?.message || e);
      console.warn("RUN CLUSTER FAIL:", msg);
      setErr(msg);
      alert(msg);
    } finally {
      setBusy(false);
      setAiLoading(false);
    }
  }

  // Placeholder: jika UI anda ada Apply Merge / Agreed, anda boleh sambung ikut flow asal anda.
  async function applyMerge() {
    alert("applyMerge belum disambung dalam versi ini (ikut implementasi anda).");
  }

  return (
    <div style={{ padding: 16 }}>
      <h1 style={{ marginTop: 0 }}>Cluster Page</h1>

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <input
          value={sessionId}
          onChange={(e) => setSessionId(e.target.value)}
          placeholder="Session"
          style={{ padding: 6, minWidth: 240 }}
        />

        <button onClick={runClustering} disabled={busy || aiLoading}>
          {aiLoading ? "NOSS AI loading..." : "Run AI (Clustering)"}
        </button>

        <button onClick={loadResult} disabled={busy}>
          Reload Result
        </button>

        <button onClick={applyMerge} disabled={busy || !clusters.length}>
          Apply AI (Merge)
        </button>
      </div>

      <div style={{ marginTop: 10 }}>
        <div>
          <b>Session:</b> {sidTrim || "-"} &nbsp;&nbsp;{" "}
          <b style={{ color: agreed ? "green" : "orange" }}>
            {agreed ? "AGREED" : "* BELUM AGREED"}
          </b>
        </div>

        {err ? (
          <div style={{ color: "crimson", marginTop: 6 }}>
            <b>Error:</b> {err}
          </div>
        ) : null}
      </div>

      <div style={{ marginTop: 16, padding: 12, border: "1px solid #ddd", borderRadius: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <b>Edit Clustering (sebelum Merge)</b>
          <div style={{ display: "flex", gap: 8 }}>
            <button disabled={busy}>+ Add Cluster</button>
            <button disabled={busy || !clusters.length}>Agreed</button>
          </div>
        </div>

        <div style={{ marginTop: 8, fontSize: 13, color: "#444" }}>
          Anda boleh ubah tajuk cluster dan pindahkan aktiviti. Selepas selesai, tekan <b>Agreed</b> untuk lock sebelum{" "}
          <b>Apply AI (Merge)</b>.
        </div>

        <div style={{ marginTop: 10 }}>
          {!clusters.length ? (
            <div>Belum ada hasil clustering. Tekan <b>Run AI (Clustering)</b>.</div>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {clusters.map((cl, i) => (
                <div key={i} style={{ border: "1px solid #eee", borderRadius: 8, padding: 10 }}>
                  <div style={{ fontWeight: 700 }}>{cl.title}</div>
                  <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
                    {(cl.cards || []).map((c) => (
                      <div key={c.id} style={{ padding: 8, border: "1px solid #f0f0f0", borderRadius: 6 }}>
                        {c.text || <i>(tiada teks)</i>}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={{ marginTop: 20 }}>
        <h2>MySPIKE Comparison</h2>
        <div>Tiada comparison lagi. Klik Run AI Comparison (MySPIKE).</div>
      </div>

      <div style={{ marginTop: 20 }}>
        <h2>CU/WA (hasil Apply)</h2>
        <div>Tiada output CU/WA. Klik Apply AI (Merge) atau Reload CU (cus).</div>
        {rawResult?.generatedAt ? (
          <div style={{ marginTop: 6, fontSize: 12, color: "#777" }}>
            cluster generatedAt: {rawResult.generatedAt}
          </div>
        ) : null}
      </div>
    </div>
  );
}
