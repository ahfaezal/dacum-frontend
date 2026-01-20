import React, { useMemo, useState } from "react";

const API_BASE =
  (import.meta?.env?.VITE_API_BASE && String(import.meta.env.VITE_API_BASE)) ||
  "https://dacum-backend.onrender.com";

export default function ClusterPage() {
  const [sessionId, setSessionId] = useState("");

  // cards
  const [cardsItems, setCardsItems] = useState([]);

  // cluster result
  const [clusterRes, setClusterRes] = useState(null);
  const [clusterLoading, setClusterLoading] = useState(false);
  const [clusterErr, setClusterErr] = useState("");

  // apply result
  const [applyLoading, setApplyLoading] = useState(false);
  const [applyErr, setApplyErr] = useState("");
  const [applyRes, setApplyRes] = useState(null);

  // cus in session
  const [cusRes, setCusRes] = useState(null);
  const [cusLoading, setCusLoading] = useState(false);
  const [cusErr, setCusErr] = useState("");

  // MySPIKE compare
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareErr, setCompareErr] = useState("");
  const [compareRes, setCompareRes] = useState(null);

  async function apiGet(path) {
    const res = await fetch(`${API_BASE}${path}`);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(json?.error || json?.message || `GET ${path} -> ${res.status}`);
    }
    return json;
  }

  async function apiPost(path, body) {
    const res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(json?.error || json?.message || `POST ${path} -> ${res.status}`);
    }
    return json;
  }

  function sidClean() {
    const sid = String(sessionId || "").trim();
    if (!sid) throw new Error("Sila isi sessionId dahulu (cth: Masjid).");
    return sid;
  }

  async function loadCards(sid) {
    // backend compat: /api/cards/:sessionId mungkin return {ok, items} atau array
    const cardsRes = await apiGet(`/api/cards/${encodeURIComponent(sid)}`);
    const items = Array.isArray(cardsRes?.items) ? cardsRes.items : Array.isArray(cardsRes) ? cardsRes : [];
    setCardsItems(items);
    return items;
  }

  async function loadClusterResult(sid) {
    const data = await apiGet(`/api/cluster/result/${encodeURIComponent(sid)}`);
    setClusterRes(data);
    return data;
  }

  async function runCluster() {
    setClusterLoading(true);
    setClusterErr("");
    setClusterRes(null);
    setApplyRes(null);
    try {
      const sid = sidClean();

      // pastikan cards siap load supaya UI boleh paparkan WA bawah clusters
      await loadCards(sid);

      // run OpenAI cluster
      await apiPost("/api/cluster/run", { sessionId: sid });

      // ambil result
      await loadClusterResult(sid);
    } catch (e) {
      setClusterErr(String(e?.message || e));
    } finally {
      setClusterLoading(false);
    }
  }

  async function applyCluster() {
    setApplyLoading(true);
    setApplyErr("");
    setApplyRes(null);
    try {
      const sid = sidClean();
      const out = await apiPost("/api/cluster/apply", { sessionId: sid });
      setApplyRes(out);

      // reload cus
      await loadCus(sid);
    } catch (e) {
      setApplyErr(String(e?.message || e));
    } finally {
      setApplyLoading(false);
    }
  }

  async function loadCus(sidParam) {
    setCusLoading(true);
    setCusErr("");
    setCusRes(null);
    try {
      const sid = sidParam || sidClean();
      const data = await apiGet(`/api/session/cus/${encodeURIComponent(sid)}`);
      setCusRes(data);
      return data;
    } catch (e) {
      setCusErr(String(e?.message || e));
    } finally {
      setCusLoading(false);
    }
  }

  async function ensureMyspikeIndex() {
    const st = await apiGet("/api/myspike/index/status");
    const total = Number(st?.meta?.totalCU || 0);
    if (!total) {
      await apiPost("/api/myspike/index/build", { fromPage: 1, toPage: 1 });
    }
  }

  function buildCusFromClusterAndCards(clusterResult, items) {
    const cardsMap = new Map((Array.isArray(items) ? items : []).map((c) => [c.id, c]));
    const clusters = Array.isArray(clusterResult?.clusters) ? clusterResult.clusters : [];

    return clusters
      .map((cl, idx) => {
        const cuTitle = String(cl?.suggestedCU?.title || cl?.title || "").trim() || `CU ${idx + 1}`;
        const cardIds = Array.isArray(cl?.cardIds) ? cl.cardIds : [];
        const activities = cardIds
          .map((id) => cardsMap.get(id))
          .filter(Boolean)
          .map((c) => ({ waTitle: String(c.activity || c.name || c.title || "").trim() }))
          .filter((a) => a.waTitle);

        return { cuCode: "", cuTitle, activities };
      })
      .filter((x) => x.cuTitle && x.activities?.length);
  }

  async function runMySpikeCompare() {
    setCompareLoading(true);
    setCompareErr("");
    setCompareRes(null);
    try {
      const sid = sidClean();

      // 1) pastikan index MySPIKE ada
      await ensureMyspikeIndex();

      // 2) cards (guna return items terus supaya tak kena state async)
      const items = await loadCards(sid);

      // 3) cluster result: cuba get; kalau 404, minta user run cluster dulu (lebih jelas)
      let cr;
      try {
        cr = await loadClusterResult(sid);
      } catch (e) {
        // kalau tiada cluster result, kita bagi arahan jelas
        throw new Error("Tiada cluster result. Klik 'Run AI Cluster (OpenAI)' dahulu.");
      }

      // 4) bina cus untuk compare
      const cus = buildCusFromClusterAndCards(cr, items);
      if (!cus.length) {
        throw new Error("Tiada CU untuk dibandingkan. Pastikan clusters ada cardIds & cards ada teks.");
      }

      // 5) compare
      const out = await apiPost("/api/s2/compare", {
        sessionId: sid,
        meta: { sessionId: sid, source: "inoss-ui" },
        cus,
        options: { thresholdAda: 0.78, topK: 5 },
      });

      setCompareRes(out);
    } catch (e) {
      setCompareErr(String(e?.message || e));
    } finally {
      setCompareLoading(false);
    }
  }

  const compareRows = useMemo(() => {
    return Array.isArray(compareRes?.results) ? compareRes.results : [];
  }, [compareRes]);

  const clusters = Array.isArray(clusterRes?.clusters) ? clusterRes.clusters : [];

  return (
    <div style={{ padding: 16, fontFamily: "system-ui, Arial" }}>
      <h2 style={{ margin: "0 0 12px" }}>Cluster Page</h2>

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <input
          value={sessionId}
          onChange={(e) => setSessionId(e.target.value)}
          placeholder="Session ID (cth: Masjid)"
          style={{ padding: 8, width: 260 }}
        />

        <button onClick={runCluster} disabled={clusterLoading}>
          {clusterLoading ? "Running Cluster..." : "Run AI Cluster (OpenAI)"}
        </button>

        <button onClick={applyCluster} disabled={applyLoading}>
          {applyLoading ? "Applying..." : "Apply AI (Merge)"}
        </button>

        <button onClick={() => loadCus()} disabled={cusLoading}>
          {cusLoading ? "Loading CU..." : "Reload CU (cus)"}
        </button>

        <button onClick={runMySpikeCompare} disabled={compareLoading}>
          {compareLoading ? "Running Compare..." : "Run AI Comparison (MySPIKE)"}
        </button>
      </div>

      {(clusterErr || applyErr || cusErr || compareErr) && (
        <div style={{ marginTop: 12, padding: 10, border: "1px solid #f3b4b4", background: "#fff7f7" }}>
          {clusterErr ? <div><b>Cluster error:</b> {clusterErr}</div> : null}
          {applyErr ? <div><b>Apply error:</b> {applyErr}</div> : null}
          {cusErr ? <div><b>CUS error:</b> {cusErr}</div> : null}
          {compareErr ? <div><b>Compare error:</b> {compareErr}</div> : null}
        </div>
      )}

      {/* Hasil Clustering */}
      {clusterRes ? (
        <div style={{ marginTop: 16 }}>
          <h3 style={{ margin: "10px 0" }}>Hasil Clustering (OpenAI)</h3>
          <div style={{ fontSize: 13, opacity: 0.9 }}>
            sessionId: <b>{clusterRes.sessionId}</b> | generatedAt: {clusterRes.generatedAt}
          </div>

          <div style={{ marginTop: 10 }}>
            {clusters.map((c, i) => {
              const cuTitle = c.suggestedCU?.title || c.title || `CU ${i + 1}`;
              const waList = (Array.isArray(c.cardIds) ? c.cardIds : [])
                .map((id) => cardsItems.find((x) => x.id === id))
                .filter(Boolean);

              return (
                <div key={i} style={{ marginBottom: 12, padding: 10, border: "1px solid #ddd" }}>
                  <div style={{ fontWeight: 700 }}>
                    {cuTitle} <span style={{ fontWeight: 400 }}>— {waList.length} kad</span>
                  </div>
                  {waList.length > 0 ? (
                    <ul style={{ margin: "8px 0 0 18px" }}>
                      {waList.map((wa, idx) => (
                        <li key={idx}>{wa.activity || wa.title || wa.name}</li>
                      ))}
                    </ul>
                  ) : (
                    <div style={{ marginTop: 6, fontStyle: "italic" }}>Tiada kad dipadankan.</div>
                  )}
                </div>
              );
            })}
            {!clusters.length ? <div style={{ marginTop: 8 }}>Tiada clusters.</div> : null}
          </div>
        </div>
      ) : null}

      {/* Apply Result */}
      {applyRes ? (
        <div style={{ marginTop: 16, padding: 10, border: "1px solid #cfe6cf", background: "#f6fff6" }}>
          <b>Apply OK:</b> sessionId {applyRes.sessionId} | cusCount {applyRes.cusCount} | appliedAt{" "}
          {applyRes.appliedAt}
        </div>
      ) : null}

      {/* CUS */}
      {cusRes ? (
        <div style={{ marginTop: 16 }}>
          <h3 style={{ margin: "10px 0" }}>CU/WA (hasil Apply)</h3>
          <div style={{ fontSize: 13, opacity: 0.9 }}>
            sessionId: <b>{cusRes.sessionId}</b> | appliedAt: {String(cusRes.appliedAt || "-")}
          </div>

          {(cusRes.cus || []).map((cu) => (
            <div key={cu.cuId} style={{ marginTop: 10, padding: 10, border: "1px solid #ddd" }}>
              <div style={{ fontWeight: 700 }}>
                {cu.cuId}: {cu.cuTitle}
              </div>
              <ul style={{ margin: "8px 0 0 18px" }}>
                {(cu.activities || []).map((wa) => (
                  <li key={wa.waId}>
                    {wa.waId}: {wa.waTitle}
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {(!cusRes.cus || !cusRes.cus.length) && (
            <div style={{ marginTop: 8 }}>Belum ada CU. Klik “Apply AI (Merge)” dahulu.</div>
          )}
        </div>
      ) : null}

      {/* MySPIKE Compare */}
      {compareRes ? (
        <div style={{ marginTop: 18 }}>
          <h3 style={{ margin: "10px 0" }}>MySPIKE Comparison</h3>
          <div style={{ marginBottom: 8 }}>
            MySPIKE Index:{" "}
            <b>{compareRes?.myspike?.totalCandidates ? `${compareRes.myspike.totalCandidates} CU` : "—"}</b>
            {" "} | ADA: <b>{compareRes?.summary?.ada ?? 0}</b> | TIADA: <b>{compareRes?.summary?.tiada ?? 0}</b>
          </div>

          {compareRows.length ? (
            <table cellPadding="8" style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead>
                <tr>
                  <th align="left" style={{ borderBottom: "1px solid #ccc" }}>CU (iNOSS)</th>
                  <th align="left" style={{ borderBottom: "1px solid #ccc" }}>Status</th>
                  <th align="left" style={{ borderBottom: "1px solid #ccc" }}>Best Score</th>
                  <th align="left" style={{ borderBottom: "1px solid #ccc" }}>Top MySPIKE Match</th>
                </tr>
              </thead>
              <tbody>
                {compareRows.map((r, i) => {
                  const inputTitle = r?.input?.cuTitle || "-";
                  const status = r?.decision?.status || "-";
                  const score = r?.decision?.bestScore ?? 0;
                  const top = Array.isArray(r?.matches) ? r.matches[0] : null;
                  return (
                    <tr key={i}>
                      <td style={{ borderBottom: "1px solid #eee" }}>{inputTitle}</td>
                      <td style={{ borderBottom: "1px solid #eee" }}>{status}</td>
                      <td style={{ borderBottom: "1px solid #eee" }}>{Number(score).toFixed(4)}</td>
                      <td style={{ borderBottom: "1px solid #eee" }}>
                        {top ? `${top.cuCode} — ${top.cuTitle} (score ${top.score})` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div>Tiada data.</div>
          )}
        </div>
      ) : null}
    </div>
  );
}
