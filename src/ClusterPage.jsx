import React, { useMemo, useState } from "react";

const API_BASE =
  (import.meta?.env?.VITE_API_BASE && String(import.meta.env.VITE_API_BASE)) ||
  "https://dacum-backend.onrender.com"; // tukar ikut backend anda

export default function ClusterPage() {
  const [sessionId, setSessionId] = useState("");
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareErr, setCompareErr] = useState("");
  const [compareRes, setCompareRes] = useState(null);
  const [clusterRes, setClusterRes] = useState(null);

  async function apiGet(path) {
    const res = await fetch(`${API_BASE}${path}`);
    if (!res.ok) throw new Error(`GET ${path} -> ${res.status}`);
    return await res.json();
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

async function ensureClusterResult(sessionId) {
  const sid = String(sessionId || "").trim();
  if (!sid) throw new Error("sessionId kosong");

  // 1) cuba ambil result cluster sedia ada
  const urlGet = `/api/cluster/result/${encodeURIComponent(sid)}`;

  try {
    return await apiGet(urlGet);
  } catch (e) {
    const msg = String(e?.message || e);

    // jika bukan 404, jangan auto-run (biar nampak error sebenar)
    if (!msg.includes("-> 404")) throw e;
  }

  // 2) kalau 404, auto-run cluster
  await apiPost("/api/cluster/run", { sessionId: sid });

  // 3) ambil semula result
  return await apiGet(urlGet);
}
  
  async function ensureMyspikeIndex() {
    const st = await apiGet("/api/myspike/index/status");
    const total = Number(st?.meta?.totalCU || 0);

    // Kalau kosong, build sedikit dulu (page 1 sahaja untuk permulaan)
    if (!total) {
      await apiPost("/api/myspike/index/build", { fromPage: 1, toPage: 1 });
    }
  }

  function buildCusFromClusterAndCards(clusterResult, cardsItems) {
    const cardsMap = new Map(
      (Array.isArray(cardsItems) ? cardsItems : []).map((c) => [c.id, c])
    );

    const clusters = Array.isArray(clusterResult?.clusters) ? clusterResult.clusters : [];

    // Bentuk cus[] ikut format backend /api/s2/compare
    const cus = clusters.map((cl, idx) => {
      const cuTitle =
        String(cl?.suggestedCU?.title || cl?.title || "").trim() || `CU ${idx + 1}`;

      const cardIds = Array.isArray(cl?.cardIds) ? cl.cardIds : [];
      const activities = cardIds
        .map((id) => cardsMap.get(id))
        .filter(Boolean)
        .map((c) => ({
          waTitle: String(c.activity || c.name || c.title || "").trim(),
        }))
        .filter((a) => a.waTitle);

      return {
        cuCode: "", // iNOSS CU belum ada kod, tak apa
        cuTitle,
        activities,
      };
    });

    return cus.filter((x) => x.cuTitle && x.activities?.length);
  }

  async function runMySpikeCompare() {
    setCompareLoading(true);
    setCompareErr("");
    setCompareRes(null);

    try {
      const sid = String(sessionId || "").trim();
      if (!sid) throw new Error("Sila isi sessionId dahulu.");

      // 1) Pastikan index MySPIKE wujud (kalau kosong, auto build kecil)
      await ensureMyspikeIndex();

      // 2) Ambil cards session
      const cardsRes = await apiGet(`/api/cards/${encodeURIComponent(sid)}`);
      const cardsItems = Array.isArray(cardsRes?.items) ? cardsRes.items : cardsRes; // support lama/baru

      // 3) Ambil cluster result (mesti dah run /api/cluster/run sebelum ni)
      const clusterRes = await ensureClusterResult(sid);
      setClusterRes(clusterRes);

      // 4) Bentuk cus[]
      const cus = buildCusFromClusterAndCards(clusterRes, cardsItems);
      if (!cus.length) {
        throw new Error(
          "Tiada CU untuk dibandingkan. Pastikan anda sudah buat clustering dan kad ada teks."
        );
      }

      // 5) Compare (REAL)
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

  const rows = useMemo(() => {
    const r = Array.isArray(compareRes?.results) ? compareRes.results : [];
    return r;
  }, [compareRes]);

  return (
    <div style={{ padding: 16, fontFamily: "system-ui, Arial" }}>
      <h2>Cluster Page</h2>

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
        <input
          value={sessionId}
          onChange={(e) => setSessionId(e.target.value)}
          placeholder="Session ID (cth: Masjid)"
          style={{ padding: 8, width: 260 }}
        />

        <button
          onClick={runMySpikeCompare}
          disabled={compareLoading}
          style={{ padding: "8px 12px", cursor: compareLoading ? "not-allowed" : "pointer" }}
        >
          {compareLoading ? "Running..." : "Run AI Comparison (MySPIKE)"}
        </button>
      </div>

      {compareErr ? (
        <div style={{ padding: 10, background: "#ffecec", border: "1px solid #ffb3b3" }}>
          <b>Error:</b> {compareErr}
        </div>
      ) : null}

{clusterRes ? (
  <div style={{ marginTop: 12, padding: 10, border: "1px solid #ddd" }}>
    <b>Hasil Clustering (CU iNOSS)</b>

    <div style={{ marginTop: 8 }}>
      {(clusterRes.clusters || []).map((c, i) => {
        const cuTitle =
          c.suggestedCU?.title || c.title || `CU ${i + 1}`;

        const waList = (Array.isArray(c.cardIds) ? c.cardIds : [])
          .map((id) =>
            cardsItems.find((x) => x.id === id)
          )
          .filter(Boolean);

        return (
          <div key={i} style={{ marginBottom: 14 }}>
            <div>
              <b>{cuTitle}</b> — {waList.length} kad
            </div>

            {waList.length > 0 && (
              <ul style={{ marginTop: 6, marginLeft: 18 }}>
                {waList.map((wa, idx) => (
                  <li key={idx}>
                    {wa.activity || wa.title || wa.name}
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  </div>
) : null}
      
      {compareRes ? (
        <div style={{ marginTop: 12 }}>
          <div style={{ marginBottom: 10 }}>
            <b>MySPIKE Index:</b>{" "}
            {compareRes?.myspike?.totalCandidates
              ? `${compareRes.myspike.totalCandidates} CU`
              : "—"}{" "}
            | <b>ADA:</b> {compareRes?.summary?.ada ?? 0} | <b>TIADA:</b>{" "}
            {compareRes?.summary?.tiada ?? 0}
          </div>

          <table
            style={{ width: "100%", borderCollapse: "collapse", border: "1px solid #ddd" }}
          >
            <thead>
              <tr>
                <th style={{ border: "1px solid #ddd", padding: 8, textAlign: "left" }}>
                  CU (iNOSS)
                </th>
                <th style={{ border: "1px solid #ddd", padding: 8 }}>Status</th>
                <th style={{ border: "1px solid #ddd", padding: 8 }}>Best Score</th>
                <th style={{ border: "1px solid #ddd", padding: 8, textAlign: "left" }}>
                  Top MySPIKE Match
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const inputTitle = r?.input?.cuTitle || "-";
                const status = r?.decision?.status || "-";
                const score = r?.decision?.bestScore ?? 0;
                const top = Array.isArray(r?.matches) ? r.matches[0] : null;

                return (
                  <tr key={i}>
                    <td style={{ border: "1px solid #ddd", padding: 8 }}>{inputTitle}</td>
                    <td style={{ border: "1px solid #ddd", padding: 8, textAlign: "center" }}>
                      {status}
                    </td>
                    <td style={{ border: "1px solid #ddd", padding: 8, textAlign: "center" }}>
                      {Number(score).toFixed(4)}
                    </td>
                    <td style={{ border: "1px solid #ddd", padding: 8 }}>
                      {top
                        ? `${top.cuCode} — ${top.cuTitle} (score ${top.score})`
                        : "—"}
                    </td>
                  </tr>
                );
              })}
              {!rows.length ? (
                <tr>
                  <td colSpan={4} style={{ padding: 10 }}>
                    Tiada data.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
