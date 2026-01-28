import React, { useEffect, useMemo, useState } from "react";

const API_BASE =
  (import.meta?.env?.VITE_API_BASE && String(import.meta.env.VITE_API_BASE)) ||
  "https://dacum-backend.onrender.com";

function sanitizeSessionId(s) {
  return String(s || "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "");
}

export default function PanelPage() {
  const apiBase = useMemo(() => {
    const v = String(API_BASE || "").trim();
    if (!v) return "https://dacum-backend.onrender.com";
    return v.replace(/\/+$/, "");
  }, []);

  const [sessionId, setSessionId] = useState("Masjid");
  const [panelName, setPanelName] = useState("");
  const [activity, setActivity] = useState("");
  const [sending, setSending] = useState(false);
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function loadItems(sidRaw) {
    const sid = sanitizeSessionId(sidRaw);
    if (!sid) {
      setItems([]);
      return;
    }
    setBusy(true);
    try {
  const r = await fetch(
    `${apiBase}/api/liveboard/${encodeURIComponent(sid)}`
  );
  const j = await r.json();
  if (!r.ok || !j?.ok) throw new Error(j?.error || "Gagal load data");

  setItems(Array.isArray(j?.data?.cards) ? j.data.cards : []);
    } catch (e) {
      // biar senyap supaya UI tak ganggu panel
      console.error(e);
      setItems([]);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    const sid = sanitizeSessionId(sessionId);
    if (!sid) {
      setItems([]);
      return;
    }
    const t = setTimeout(() => {
      loadItems(sid).catch(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [sessionId]);

  async function submitOne() {
    setMsg("");

    const sid = sanitizeSessionId(sessionId);
    const pn = String(panelName || "").trim();
    const tx = String(activity || "").trim();

    if (!sid) return setMsg("⚠️ Sila isi SESSION (tanpa spacing).");
    if (!pn) return setMsg("⚠️ Sila isi NAMA PANEL.");
    if (!tx) return setMsg("⚠️ Sila isi Aktiviti Kerja.");

    setSending(true);
    try {
      const r = await fetch(
        `${apiBase}/api/liveboard/${encodeURIComponent(sid)}/append`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            panelName: pn,
            activity: tx,
          }),
        }
      );

      const j = await r.json();
      if (!r.ok || !j?.ok) throw new Error(j?.error || "Gagal submit");

      setActivity("");
      setMsg(`✅ Berjaya dihantar oleh ${pn}.`);
      await loadItems(sid);
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
            onClick={() => {
              setActivity("");
              setMsg("");
            }}
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

        <div style={{ marginTop: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <b>Rekod dihantar (S3)</b>
            {busy ? (
              <span style={{ fontSize: 12, color: "#666" }}>loading...</span>
            ) : null}
          </div>

          {items.length === 0 ? (
            <div style={{ marginTop: 8, fontSize: 12, color: "#666" }}>
              Tiada rekod.
            </div>
          ) : (
            <ol style={{ marginTop: 8, paddingLeft: 18 }}>
              {items
                .slice()
                .reverse()
                .map((it) => (
                  <li key={it.id} style={{ marginBottom: 10 }}>
                    <div>
                      <b>{it.panelName}</b>: {it.text}
                    </div>
                    <div style={{ fontSize: 12, color: "#666" }}>
                      {it.createdAt}
                    </div>
                  </li>
                ))}
            </ol>
          )}
        </div>

        <div style={{ marginTop: 10, fontSize: 12, color: "#666" }}>
          Nota: Panel hanya hantar kad. Fasilitator akan klik “Agreed” di LiveBoard
          bila semua input selesai.
        </div>
      </div>
    </div>
  );
}
