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
  const ct = r.headers.get("content-type") || "";
  if (ct.includes("application/json")) return r.json();
  // fallback (kalau server pulang text/html)
  const t = await r.text().catch(() => "");
  return { ok: true, text: t };
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
  const ct = r.headers.get("content-type") || "";
  if (ct.includes("application/json")) return r.json();
  const t = await r.text().catch(() => "");
  return { ok: true, text: t };
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

  // extra outputs (butang yang dipulangkan)
  const [myspikeIndexInfo, setMyspikeIndexInfo] = useState(null);
  const [myspikeComparison, setMyspikeComparison] = useState(null);
  const [cuOutput, setCuOutput] = useState(null);

  const sidTrim = useMemo(() => String(sessionId || "").trim(), [sessionId]);

  useEffect(() => {
    if (!sidTrim) return;
    loadResult();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sidTrim]);

  async function loadSessionCards(sid) {
    // ✅ server.js baharu guna: GET /api/cards/:sessionId
    const tries = [
      `/api/cards/${encodeURIComponent(sid)}`,
      // legacy fallbacks
      `/api/session/cards/${encodeURIComponent(sid)}`,
      `/api/session/${encodeURIComponent(sid)}/cards`,
      `/api/session/cards?sessionId=${encodeURIComponent(sid)}`,
    ];

    let last = "";
    for (const path of tries) {
      try {
        console.log("LOAD CARDS TRY:", path);
        const out = await apiGet(path);

        const items = Array.isArray(out) ? out : out?.items;
        if (Array.isArray(items)) return items;

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

    // 1) Ambil cluster result
    let out = null;
    try {
      const path = `/api/cluster/result/${encodeURIComponent(sid)}`;
      console.log("LOAD RESULT:", path);
      out = await apiGet(path);
    } catch (e) {
      const msg = String(e?.message || e || "");

      // 404 = normal: belum ada clustering
      if (msg.includes("404")) {
        setClusters([]);
        setRawResult(null);
        setAgreed(false);
        setErr("");
        return;
      }
      setErr(msg);
      return;
    }

    // 2) Padankan cardIds -> teks kad
    try {
      const cards = await loadSessionCards(sid);
      const cardMap = buildCardMap(cards);
      const normalized = normalizeClustersWithCardMap(out, cardMap);

      setRawResult(out);
      setClusters(normalized);
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
      // ✅ server.js baharu: POST /api/cluster/run { sessionId }
      await apiPost(`/api/cluster/run`, { sessionId: sid });

      await loadResult();
    } catch (e) {
      const msg = String(e?.message || e);
      setErr(msg);
      alert(msg);
    } finally {
      setBusy(false);
      setAiLoading(false);
    }
  }

  // =========================
  // BUTANG YANG DIPULANGKAN
  // =========================

  async function reloadCU() {
    const sid = String(sessionId || "").trim();
    if (!sid) return alert("Sila isi Session dulu.");

    setBusy(true);
    setErr("");

    const tries = [
      // paling biasa
      `/api/cus/${encodeURIComponent(sid)}`,
      `/api/cu/${encodeURIComponent(sid)}`,
      `/api/cp/draft/${encodeURIComponent(sid)}`,
      `/api/cpc/${encodeURIComponent(sid)}`,
      // query fallback
      `/api/cus?sessionId=${encodeURIComponent(sid)}`,
      `/api/cp/draft?sessionId=${encodeURIComponent(sid)}`,
      `/api/cpc?sessionId=${encodeURIComponent(sid)}`,
    ];

    let last = "";
    try {
      for (const path of tries) {
        try {
          console.log("RELOAD CU TRY:", path);
          const out = await apiGet(path);
          setCuOutput(out);
          return;
        } catch (e) {
          last = String(e?.message || e);
          console.warn("RELOAD CU FAIL:", path, last);
        }
      }
      throw new Error(last || "Gagal Reload CU (tiada endpoint serasi).");
    } catch (e) {
      const msg = String(e?.message || e);
      setErr(msg);
      alert(msg);
    } finally {
      setBusy(false);
    }
  }

  async function buildMyspikeIndex() {
    setBusy(true);
    setErr("");

    const tries = [
      `/api/myspike/index/build`, // yang memang ada dalam kod sebelum ini
      `/api/myspike/build`,
      `/api/index/myspike/build`,
    ];

    let last = "";
    try {
      for (const path of tries) {
        try {
          console.log("MYSPIKE INDEX BUILD TRY:", path);
          const out = await apiPost(path, {});
          setMyspikeIndexInfo(out);
          return;
        } catch (e) {
          last = String(e?.message || e);
          console.warn("MYSPIKE INDEX BUILD FAIL:", path, last);
        }
      }
      throw new Error(last || "Gagal bina MySPIKE index (tiada endpoint serasi).");
    } catch (e) {
      const msg = String(e?.message || e);
      setErr(msg);
      alert(msg);
    } finally {
      setBusy(false);
    }
  }

  async function runMyspikeComparison() {
    const sid = String(sessionId || "").trim();
    if (!sid) return alert("Sila isi Session dulu.");

    // Comparison perlukan CU list; dalam flow sebenar biasanya CU datang selepas Apply/Merge.
    // Jadi kita buat “safe”: kalau tiada CU output, kita maklumkan.
    if (!cuOutput) {
      alert("CU masih belum ada. Sila buat Apply AI (Merge) atau Reload CU (cus) dahulu.");
      return;
    }

    // cuba derive CU array
    const cus =
      (Array.isArray(cuOutput?.cus) && cuOutput.cus) ||
      (Array.isArray(cuOutput?.items) && cuOutput.items) ||
      (Array.isArray(cuOutput) && cuOutput) ||
      [];

    if (!cus.length) {
      alert("CU masih kosong. Pastikan endpoint Reload CU mengembalikan senarai CU.");
      return;
    }

    setBusy(true);
    setErr("");

    const tries = [
      `/api/s2/compare`, // dari server.js anda (snippet yang anda tunjuk)
      `/api/compare`,
      `/api/myspike/compare`,
    ];

    let last = "";
    try {
      for (const path of tries) {
        try {
          console.log("MYSPIKE COMPARE TRY:", path);
          const out = await apiPost(path, {
            sessionId: sid,
            cus,
            options: { thresholdAda: 0.78, topK: 3 },
            meta: { sessionId: sid, from: "ClusterPage" },
          });
          setMyspikeComparison(out);
          return;
        } catch (e) {
          last = String(e?.message || e);
          console.warn("MYSPIKE COMPARE FAIL:", path, last);
        }
      }
      throw new Error(last || "Gagal Run AI Comparison (tiada endpoint serasi).");
    } catch (e) {
      const msg = String(e?.message || e);
      setErr(msg);
      alert(msg);
    } finally {
      setBusy(false);
    }
  }

  async function applyMerge() {
    // Anda boleh sambung ke endpoint sebenar anda bila siap (contoh: /api/cluster/apply)
    alert("Apply AI (Merge) belum disambung (perlukan endpoint apply/merge di backend).");
  }

  return (
    <div style={{ padding: 16 }}>
      <h1 style={{ marginTop: 0 }}>Cluster Page</h1>

      {/* BAR BUTANG — susun semula ikut gaya asal */}
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

        {/* ✅ butang yang hilang — dipulangkan */}
        <button onClick={reloadCU} disabled={busy}>
          Reload CU (cus)
        </button>

        <button onClick={buildMyspikeIndex} disabled={busy}>
          Build MySPIKE Index
        </button>

        <button onClick={runMyspikeComparison} disabled={busy}>
          Run AI Comparison (MySPIKE)
        </button>
      </div>

      <div style={{ marginTop: 10 }}>
        <div>
          <b>Session:</b> {sidTrim || "-"} &nbsp;&nbsp;
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
        {!myspikeComparison ? (
          <div>Tiada comparison lagi. Klik <b>Run AI Comparison (MySPIKE)</b>.</div>
        ) : (
          <pre style={{ whiteSpace: "pre-wrap", background: "#fafafa", padding: 12, borderRadius: 8, border: "1px solid #eee" }}>
            {JSON.stringify(myspikeComparison, null, 2)}
          </pre>
        )}
      </div>

      <div style={{ marginTop: 20 }}>
        <h2>CU/WA (hasil Apply)</h2>
        {!cuOutput ? (
          <div>Tiada output CU/WA. Klik <b>Apply AI (Merge)</b> atau <b>Reload CU (cus)</b>.</div>
        ) : (
          <pre style={{ whiteSpace: "pre-wrap", background: "#fafafa", padding: 12, borderRadius: 8, border: "1px solid #eee" }}>
            {JSON.stringify(cuOutput, null, 2)}
          </pre>
        )}

        {rawResult?.generatedAt ? (
          <div style={{ marginTop: 6, fontSize: 12, color: "#777" }}>
            cluster generatedAt: {rawResult.generatedAt}
          </div>
        ) : null}

        {myspikeIndexInfo ? (
          <div style={{ marginTop: 6, fontSize: 12, color: "#777" }}>
            MySPIKE index: siap / respon diterima
          </div>
        ) : null}
      </div>
    </div>
  );
}
