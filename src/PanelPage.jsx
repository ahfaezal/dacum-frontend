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
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  async function addCards() {
    const sid = String(sessionId || "").trim();
    if (!sid) return alert("Sila isi Session dulu.");

    const raw = String(text || "").trim();
    if (!raw) return alert("Sila isi aktiviti/kad dulu.");

    const lines = raw
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);

    if (lines.length === 0) return alert("Tiada teks yang sah.");

    setSaving(true);
    setMsg("");

    try {
      for (const name of lines) {
        let ok = false;

        // Attempt A: POST /api/cards/add
        try {
          const r1 = await fetch(`${apiBase}/api/cards/add`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionId: sid, name }),
          });
          const j1 = await r1.json().catch(() => null);
          if (r1.ok && (j1?.ok || j1?.success || j1)) ok = true;
        } catch (e) {}

        // Attempt B: POST /api/cards
        if (!ok) {
          try {
            const r2 = await fetch(`${apiBase}/api/cards`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ sessionId: sid, name }),
            });
            const j2 = await r2.json().catch(() => null);
            if (r2.ok && (j2?.ok || j2?.success || j2)) ok = true;
          } catch (e) {}
        }

        if (!ok) {
          throw new Error(
            "Gagal hantar kad. Semak endpoint backend (POST /api/cards/add atau POST /api/cards)."
          );
        }
      }

      setText("");
      setMsg(`✅ Berjaya hantar ${lines.length} kad untuk session "${sid}".`);
    } catch (e) {
      setMsg(`❌ ${String(e?.message || e)}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ padding: 16, maxWidth: 720, margin: "0 auto" }}>
      <h2 style={{ marginTop: 0 }}>Panel Input (Hantar Kad)</h2>

      <div style={{ fontSize: 12, color: "#555", marginBottom: 10 }}>
        API: <code>{apiBase}</code>
      </div>

      <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12, background: "#fff" }}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>SESSION</div>
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

        <div style={{ fontWeight: 800, marginBottom: 6 }}>AKTIVITI / KAD (1 BARIS = 1 KAD)</div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          placeholder={"Taip 1 aktiviti per baris.\nContoh:\nImamkan Solat Fardu\nSampaikan Khutbah\nSelaras Program Kuliah"}
          style={{
            width: "100%",
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid #ccc",
            marginBottom: 10,
            resize: "vertical",
          }}
        />

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            onClick={addCards}
            disabled={saving}
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #0b5",
              background: saving ? "#ddd" : "#0b5",
              color: "#fff",
              cursor: saving ? "not-allowed" : "pointer",
              flex: 1,
            }}
          >
            {saving ? "Menghantar..." : "Hantar Kad"}
          </button>

          <button
            onClick={() => setText("")}
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
          <div style={{ marginTop: 10, fontSize: 13, whiteSpace: "pre-wrap" }}>{msg}</div>
        ) : null}

        <div style={{ marginTop: 10, fontSize: 12, color: "#666" }}>
          Nota: Tiada butang “Agreed” di sini. Fasilitator akan “Agreed” di LiveBoard bila semua input selesai.
        </div>
      </div>
    </div>
  );
}
