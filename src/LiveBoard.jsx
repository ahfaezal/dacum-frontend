import React, { useEffect, useMemo, useState } from "react";

const API_BASE =
  import.meta.env.VITE_API_BASE || "https://dacum-backend.onrender.com";

export default function LiveBoard({ onAgreed }) {
  const apiBase = useMemo(() => {
    const v = String(API_BASE || "").trim();
    if (!v) return "https://dacum-backend.onrender.com";
    return v.replace("onrenderer.com", "onrender.com").replace(/\/+$/, "");
  }, []);

  const [sessionId, setSessionId] = useState("Masjid");
  const [cards, setCards] = useState([]);

  function goAgreed() {
    const sid = String(sessionId || "").trim();
    if (!sid) return alert("Sila isi Session dulu.");
    onAgreed?.(sid);
  }

  async function refreshCards(sid) {
    try {
      const r = await fetch(`${apiBase}/api/cards/${encodeURIComponent(sid)}`);
      const j = await r.json();
      if (j && j.ok && Array.isArray(j.items)) setCards(j.items);
    } catch (e) {}
  }

  useEffect(() => {
    let alive = true;

    async function tick() {
      if (!alive) return;
      const sid = String(sessionId || "").trim();
      if (!sid) return;
      await refreshCards(sid);
    }

    tick();
    const t = setInterval(tick, 1200);

    return () => {
      alive = false;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiBase, sessionId]);

  return (
    <div style={{ padding: 20, maxWidth: 1200, margin: "0 auto" }}>
      <h1 style={{ marginTop: 0 }}>Live Board (DACUM Card) — Fasilitator</h1>

      <div style={{ fontSize: 13, color: "#555", marginBottom: 10 }}>
        Status: <strong>connected</strong> | API: <code>{apiBase}</code> | Session:{" "}
        <strong>{String(sessionId || "").trim() || "-"}</strong>{" "}
        <span style={{ marginLeft: 10 }}>LIVE</span>
      </div>

      <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12, background: "#fff" }}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>TAJUK NOSS / SESSION</div>

        <input
          value={sessionId}
          onChange={(e) => setSessionId(e.target.value)}
          style={{
            width: "100%",
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid #ccc",
            marginBottom: 10,
          }}
        />

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            onClick={goAgreed}
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #111",
              background: "#111",
              color: "#fff",
              cursor: "pointer",
            }}
            title="Bila semua ahli panel selesai input, klik untuk ke paparan Clustering"
          >
            Agreed (Ke Clustering)
          </button>
        </div>

        <div style={{ marginTop: 10, fontSize: 12, color: "#666" }}>
          Nota: Ahli panel buat input melalui paparan “Panel Input”. Fasilitator pantau kad di sini dan klik “Agreed”
          apabila semua input selesai.
        </div>
      </div>

      <div style={{ marginTop: 14, border: "1px solid #ddd", borderRadius: 12, padding: 12, background: "#fff" }}>
        <div style={{ fontWeight: 800, marginBottom: 10 }}>SENARAI KAD (LIVE)</div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
          {cards.map((c) => (
            <div key={String(c.id)} style={{ border: "1px solid #eee", borderRadius: 12, padding: 10 }}>
              <div style={{ fontWeight: 800 }}>{String(c.name || c.activity || "").trim()}</div>
              <div style={{ fontSize: 12, color: "#666", marginTop: 6 }}>
                {c.time ? String(c.time) : ""}
              </div>
            </div>
          ))}

          {cards.length === 0 ? (
            <div style={{ gridColumn: "1 / -1", color: "#777", fontSize: 13 }}>
              Belum ada kad untuk session ini (atau endpoint `/api/cards/:sessionId` belum wujud / tiada data).
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
