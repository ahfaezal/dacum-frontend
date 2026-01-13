import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import io from "socket.io-client";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

function App() {
  const [cards, setCards] = useState([]);
  const [name, setName] = useState("");
  const [activity, setActivity] = useState("");
  const [session, setSession] = useState("dacum-demo");
  const [status, setStatus] = useState("connecting...");

  const socket = useMemo(() => io(API_BASE, { transports: ["websocket"] }), []);

  useEffect(() => {
    socket.on("connect", () => setStatus("connected"));
    socket.on("disconnect", () => setStatus("disconnected"));

    socket.emit("join", session);

    socket.on("cards:update", (payload) => {
      setCards(payload || []);
    });

    // initial fetch
    fetch(`${API_BASE}/cards/${session}`)
      .then((r) => r.json())
      .then((d) => setCards(d || []))
      .catch(() => {});

    return () => {
      socket.off();
      socket.disconnect();
    };
  }, [socket, session]);

  async function submitCard(e) {
    e.preventDefault();
    const payload = { name: name.trim(), activity: activity.trim() };
    if (!payload.name || !payload.activity) return;

    const res = await fetch(`${API_BASE}/cards/${session}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      setName("");
      setActivity("");
    } else {
      alert("Gagal submit. Semak backend.");
    }
  }

  return (
    <div style={{ fontFamily: "system-ui", maxWidth: 980, margin: "24px auto", padding: 16 }}>
      <h1 style={{ marginBottom: 6 }}>Digital DACUM</h1>
      <div style={{ marginBottom: 14, opacity: 0.75 }}>Status: {status} | API: {API_BASE}</div>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 320px", border: "1px solid #ddd", borderRadius: 12, padding: 14 }}>
          <h3 style={{ marginTop: 0 }}>Panel Input (Simulasi QR)</h3>

          <div style={{ marginBottom: 10 }}>
            <label>Session/Workshop ID</label>
            <input
              value={session}
              onChange={(e) => setSession(e.target.value)}
              style={{ width: "100%", padding: 10, marginTop: 6, borderRadius: 10, border: "1px solid #ccc" }}
              placeholder="contoh: dacum-jan2026"
            />
            <small style={{ opacity: 0.75 }}>Tip: guna session berbeza untuk workshop berbeza.</small>
          </div>

          <form onSubmit={submitCard}>
            <div style={{ marginBottom: 10 }}>
              <label>Nama</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={{ width: "100%", padding: 10, marginTop: 6, borderRadius: 10, border: "1px solid #ccc" }}
                placeholder="Nama panel"
              />
            </div>

            <div style={{ marginBottom: 10 }}>
              <label>Maklumat Aktiviti Kerja</label>
              <textarea
                value={activity}
                onChange={(e) => setActivity(e.target.value)}
                style={{ width: "100%", padding: 10, marginTop: 6, borderRadius: 10, border: "1px solid #ccc", minHeight: 90 }}
                placeholder="Contoh: Menyemak keperluan kompetensi..."
              />
            </div>

            <button
              type="submit"
              style={{ width: "100%", padding: 12, borderRadius: 12, border: 0, cursor: "pointer" }}
            >
              Submit
            </button>
          </form>

          <div style={{ marginTop: 10, fontSize: 12, opacity: 0.75 }}>
            * Ini versi awal. Nanti kita tambah scan QR sebenar (kamera phone).
          </div>
        </div>

        <div style={{ flex: "2 1 520px", border: "1px solid #ddd", borderRadius: 12, padding: 14 }}>
          <h3 style={{ marginTop: 0 }}>Live Board</h3>
          <div style={{ display: "grid", gap: 10 }}>
            {cards.length === 0 ? (
              <div style={{ opacity: 0.7 }}>Belum ada DACUM card. Cuba submit satu.</div>
            ) : (
              cards.slice().reverse().map((c, idx) => (
                <div key={idx} style={{ border: "1px solid #eee", borderRadius: 12, padding: 12 }}>
                  <div style={{ fontWeight: 700 }}>{c.name}</div>
                  <div style={{ marginTop: 6 }}>{c.activity}</div>
                  <div style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>
                    {c.createdAt ? new Date(c.createdAt).toLocaleString() : ""}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
