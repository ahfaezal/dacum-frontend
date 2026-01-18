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
  const [freeze, setFreeze] = useState(false);

  function goAgreed() {
    const sid = String(sessionId || "").trim();
    if (!sid) return alert("Sila isi Session dulu.");
    onAgreed?.(sid);
  }

  function goFullscreen() {
    const el = document.documentElement;
    if (!document.fullscreenElement) {
      el.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  }

  // Poll LIVE cards (boleh di-freeze)
  useEffect(() => {
    if (freeze) return;

    let alive = true;

    async function tick() {
      if (!alive) return;
      const sid = String(sessionId || "").trim();
      if (!sid) return;

      try {
        const r = await fetch(`${apiBase}/api/cards/${encodeURIComponent(sid)}`);
        const j = await r.json();
        if (j && j.ok && Array.isArray(j.items)) {
          setCards(j.items);
        }
      } catch {}
    }

    tick();
    const t = setInterval(tick, 1200);

    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [apiBase, sessionId, freeze]);

  return (
    <div style={{ padding: 20, maxWidth: 1300, margin: "0 auto" }}>
      <h1 style={{ marginTop: 0 }}>
        Live Board (DACUM Card) — Fasilitator
      </h1>

      <div style={{ fontSize: 13, color: "#555", marginBottom: 10 }}>
        Status: <strong>{freeze ? "FREEZE" : "LIVE"}</strong> | API:{" "}
        <code>{apiBase}</code> | Session:{" "}
        <strong>{sessionId}</strong>
      </div>

      {/* TAJUK / SESSION */}
      <div
        style={{
          border: "1px solid #ddd",
          borderRadius: 12,
          padding: 12,
          background: "#fff",
          marginBottom: 14,
        }}
      >
        <div style={{ fontWeight: 800, marginBottom: 8 }}>
          TAJUK NOSS / SESSION
        </div>

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

        {/* Freeze + Fullscreen */}
        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={() => setFreeze((f) => !f)}
            style={{
              padding: "8px 14px",
              borderRadius: 10,
              border: "1px solid #111",
              background: freeze ? "#b91c1c" : "#111",
              color: "#fff",
              cursor: "pointer",
            }}
          >
            {freeze ? "Unfreeze" : "Freeze"}
          </button>

          <button
            onClick={goFullscreen}
            style={{
              padding: "8px 14px",
              borderRadius: 10,
              border: "1px solid #444",
              background: "#fff",
              cursor: "pointer",
            }}
          >
            Fullscreen
          </button>
        </div>

        <div style={{ marginTop: 10, fontSize: 12, color: "#666" }}>
          Nota: Freeze digunakan semasa perbincangan & pengesahan akhir.
        </div>
      </div>

      {/* SENARAI KAD */}
      <div
        style={{
          border: "1px solid #ddd",
          borderRadius: 12,
          padding: 12,
          background: "#fff",
        }}
      >
        <div style={{ fontWeight: 800, marginBottom: 10 }}>
          SENARAI KAD (LIVE)
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 10,
          }}
        >
          {cards.map((c) => (
            <div
              key={String(c.id)}
              style={{
                border: "1px solid #eee",
                borderRadius: 12,
                padding: 10,
                background: "#fafafa",
              }}
            >
              <div style={{ fontWeight: 800 }}>
                {String(c.activity || c.name || "").trim()}
              </div>
              <div style={{ fontSize: 12, color: "#666", marginTop: 6 }}>
                {c.time}
              </div>
            </div>
          ))}

          {cards.length === 0 && (
            <div
              style={{
                gridColumn: "1 / -1",
                color: "#777",
                fontSize: 13,
              }}
            >
              Belum ada kad untuk session ini.
            </div>
          )}
        </div>

        {/* AGREED – DI BAWAH SENARAI KAD */}
        <div
          style={{
            marginTop: 16,
            display: "flex",
            justifyContent: "flex-end",
          }}
        >
          <button
            onClick={goAgreed}
            style={{
              padding: "12px 22px",
              borderRadius: 12,
              border: "1px solid #111",
              background: "#111",
              color: "#fff",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            Agreed (Ke Clustering)
          </button>
        </div>
      </div>
    </div>
  );
}
