import React, { useMemo, useState } from "react";

const API_BASE =
  import.meta.env.VITE_API_BASE || "https://dacum-backend.onrender.com";

export default function PanelPage() {
  const apiBase = useMemo(() => {
    const v = String(API_BASE || "").trim();
    if (!v) return "https://dacum-backend.onrender.com";
    return v.replace("onrenderer.com", "onrender.com").replace(/\/+$/, "");
  }, []);

  const [sessionId, setSessionId] = useState("Masjid");
  const [panelName, setPanelName] = useState("");
  const [activity, setActivity] = useState("");
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState("");

  async function submitOne() {
    const sid = String(sessionId || "").trim();
    const name = String(panelName || "").trim();
    const act = String(activity || "").trim();

    if (!sid) return alert("Sila isi Session.");
    if (!name) return alert("Sila isi Nama Panel.");
    if (!act) return alert("Sila isi Aktiviti Kerja.");

    setSending(true);
    setMsg("");

    try {
      // ✅ Endpoint utama (paling munasabah):
      // POST /api/cards/:sessionId
      // body: { name, panelName, activity }
      const url = `${apiBase}/api/cards/${encodeURIComponent(sid)}`;

      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: act,          // supaya selari dengan paparan kad (c.name)
          panelName: name,    // simpan siapa hantar
          activity: act,      // redundan tapi selamat
          time: new Date().toISOString(),
        }),
      });

      const j = await r.json().catch(() => null);

      if (!r.ok || (j && j.ok === false)) {
        throw new Error(
          (j && (j.error || j.message)) ||
            `Gagal hantar (HTTP ${r.status}). Endpoint backend mungkin berbeza.`
        );
      }

      setActivity("");
      setMsg(`✅ Berjaya dihantar oleh ${name}: ${act}`);
    } catch (e) {
      setMsg(`❌ ${String(e?.message || e)}`);
    } finally {
      setSending(false);
    }
  }

  return (
    <div style={{ padding: 16, maxWidth: 720, margin: "0 auto" }}>
      <h2 style={{ marginTop: 0 }}>Panel Input (Hantar Kad)</h2>

      <div style={{ fontSize: 12, color: "#555", marginBottom: 10 }}>
        API: <code>{apiBase}</code>
      </div>

      <div
        style={{
          border: "1px solid #ddd",
          borderRadius: 12,
          padding: 12,
          background: "#fff",
        }}
      >
        <div style={{ fontWeight: 800, marginBottom: 6 }}>SESSION</div>
        <input
          value={sessionId}
          onChange={(e) => setSessionId(e.target.value)}
          style={{
            width: "100%",
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid #ccc",
            marginBottom: 12,
          }}
        />

        <div style={{ fontWeight: 800, marginBottom: 6 }}>NAMA PANEL</div>
        <input
          value={panelName}
          onChange={(e) => setPanelName(e.target.value)}
          placeholder="Contoh: Dr. Ahmad / Pn. Siti"
          style={{
            width: "100%",
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid #ccc",
            marginBottom: 12,
          }}
        />

        <div style={{ fontWeight: 800, marginBottom: 6 }}>
          INPUT PANEL (AKTIVITI KERJA)
        </div>
        <textarea
          value={activity}
          onChange={(e) => setActivity(e.target.value)}
          rows={4}
          placeholder="Taip 1 aktiviti kerja sahaja untuk dihantar sekali submit."
          style={{
            width: "100%",
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid #ccc",
            marginBottom: 12,
            resize: "vertical",
          }}
        />

        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={submitOne}
            disabled={sending}
            style={{
              flex: 1,
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #0b5",
              background: sending ? "#ddd" : "#0b5",
              color: "#fff",
              cursor: sending ? "not-allowed" : "pointer",
            }}
          >
            {sending ? "Menghantar..." : "Submit"}
          </button>

          <button
            onClick={() => setActivity("")}
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #999",
              background: "#fff",
              color: "#111",
              cursor: "pointer",
            }}
          >
            Clear
          </button>
        </div>

        {msg ? (
          <div style={{ marginTop: 10, fontSize: 13, whiteSpace: "pre-wrap" }}>
            {msg}
          </div>
        ) : null}

        <div style={{ marginTop: 10, fontSize: 12, color: "#666" }}>
          Nota: Panel hanya hantar kad. Fasilitator akan klik “Agreed” di LiveBoard bila semua input selesai.
        </div>
      </div>
    </div>
  );
}
