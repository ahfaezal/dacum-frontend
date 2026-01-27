import React, { useEffect, useMemo, useState } from "react";

const API_BASE =
  import.meta.env.VITE_API_BASE || "https://dacum-backend.onrender.com";

export default function LiveBoard({ onAgreed }) {
  const apiBase = useMemo(() => {
    const v = String(API_BASE || "").trim();
    if (!v) return "https://dacum-backend.onrender.com";
    return v
      .replace("onrenderer.com", "onrender.com")
      .replace(/\/+$/, "");
  }, []);

  const [sessionId, setSessionId] = useState("Masjid");

  // ✅ NEW: flag untuk tunjukkan butang "Cluster Page"
  const [agreedOnce, setAgreedOnce] = useState(false);

  const [cards, setCards] = useState([]);
  const [freeze, setFreeze] = useState(false);

  // Bahasa NOSS (ditetapkan fasilitator)
  const [lang, setLang] = useState("MS"); // MS | EN
  const [langLocked, setLangLocked] = useState(false);
  const [lockedAt, setLockedAt] = useState(null);
  const [cfgErr, setCfgErr] = useState("");

  async function apiGet(path) {
    const res = await fetch(`${apiBase}${path}`);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.error || `GET ${path} -> ${res.status}`);
    return json;
  }

  async function apiPost(path, body) {
    const res = await fetch(`${apiBase}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.error || `POST ${path} -> ${res.status}`);
    return json;
  }

  // Load config bila sessionId berubah
  useEffect(() => {
    let alive = true;
    async function loadConfig() {
      setCfgErr("");
      const sid = String(sessionId || "").trim();
      if (!sid) return;

      try {
        const cfg = await apiGet(
          `/api/session/config/${encodeURIComponent(sid)}`
        );
        if (!alive) return;

        const nextLang = String(cfg?.lang || "MS").toUpperCase();
        setLang(nextLang === "EN" ? "EN" : "MS");
        setLangLocked(!!cfg?.langLocked);
        setLockedAt(cfg?.lockedAt || null);

        // ✅ jika session dah pernah lock sebelum ini, anggap sudah Agreed
        if (cfg?.langLocked) {
          setAgreedOnce(true);
          setFreeze(true); // lock senarai kad
        } else {
          setAgreedOnce(false);
        }
      } catch (e) {
        if (!alive) return;
        setCfgErr(String(e?.message || e));
      }
    }
    loadConfig();
    return () => {
      alive = false;
    };
  }, [apiBase, sessionId]);

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
        const j = await r.json().catch(() => null);
        if (!alive) return;

        // support lama/baru
        if (j && j.ok && Array.isArray(j.items)) setCards(j.items);
        else if (Array.isArray(j)) setCards(j);
      } catch {}
    }

    tick();
    const t = setInterval(tick, 1200);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [apiBase, sessionId, freeze]);

  async function changeLang(next) {
    const sid = String(sessionId || "").trim();
    if (!sid) return alert("Sila isi Session dulu.");

    const nextLang = String(next || "").toUpperCase().trim();
    if (!["MS", "EN"].includes(nextLang)) return;

    if (langLocked) {
      alert("Bahasa sudah dikunci selepas Agreed. Tidak boleh ubah lagi.");
      return;
    }

    setCfgErr("");
    setLang(nextLang);
    try {
      const out = await apiPost(
        `/api/session/config/${encodeURIComponent(sid)}`,
        { lang: nextLang }
      );
      setLang(String(out?.lang || nextLang).toUpperCase());
      setLangLocked(!!out?.langLocked);
      setLockedAt(out?.lockedAt || null);
    } catch (e) {
      setCfgErr(String(e?.message || e));
      alert(String(e?.message || e));
    }
  }

  // ✅ NEW: Agreed hanya LOCK (tidak navigate)
  async function doAgreedLockOnly() {
    const sid = String(sessionId || "").trim();
    if (!sid) return alert("Sila isi Session dulu.");

    // 0) Freeze senarai kad (kunci perbincangan)
    setFreeze(true);

    // 1) Pastikan config lang disimpan (kalau belum lock)
    try {
      if (!langLocked) {
        await apiPost(`/api/session/config/${encodeURIComponent(sid)}`, { lang });
      }
    } catch (e) {
      // kalau gagal pun, kita cuba lock
    }

    // 2) Lock bahasa (wajib sebelum clustering)
    try {
      const lock = await apiPost(`/api/session/lock/${encodeURIComponent(sid)}`);
      setLang(String(lock?.lang || lang).toUpperCase());
      setLangLocked(true);
      setLockedAt(lock?.lockedAt || new Date().toISOString());
    } catch (e) {
      // Jika sudah lock, kita benarkan proceed (anggap sudah agreed sebelum ini)
      const msg = String(e?.message || e);
      if (!/sudah dikunci|locked/i.test(msg)) {
        alert(msg);
        setFreeze(false); // rollback freeze kalau lock gagal serius
        return;
      }
      // dah lock pun dikira ok
      setLangLocked(true);
    }

    // 3) Set flag untuk munculkan butang Cluster Page
    setAgreedOnce(true);
  }

  // ✅ NEW: hanya bila user tekan "Cluster Page"
 function goClusterPage() {
  const sid = String(sessionId || "").trim();
  if (!sid) return alert("Sila isi Session dulu.");

  // kalau App pass onAgreed, guna itu
  if (typeof onAgreed === "function") {
    onAgreed(sid);
    return;
  }

  // fallback: terus navigate guna hash (confirm jalan)
  window.location.hash = `#/cluster?session=${encodeURIComponent(sid)}`;
}

  function goFullscreen() {
    const el = document.documentElement;
    if (!document.fullscreenElement) el.requestFullscreen?.();
    else document.exitFullscreen?.();
  }

  const langLabel = lang === "EN" ? "English (EN)" : "Bahasa Melayu (MS)";
  const lockText = langLocked
    ? `DIKUNCI${lockedAt ? ` @ ${lockedAt}` : ""}`
    : "BELUM LOCK";

  return (
    <div style={{ padding: 18, maxWidth: 1200, margin: "0 auto" }}>
      <h1 style={{ fontFamily: "serif", marginBottom: 10 }}>
        Live Board (DACUM Card) — Fasilitator
      </h1>

      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 14, opacity: 0.8 }}>
          Status: <b>{freeze ? "FREEZE" : "LIVE"}</b> | API:{" "}
          <code>{apiBase}</code> | Session: <b>{sessionId}</b>
        </div>
        <div style={{ fontSize: 14, marginTop: 4, opacity: 0.85 }}>
          Bahasa NOSS: <b>{langLabel}</b> | Lock: <b>{lockText}</b>
        </div>
        {cfgErr ? (
          <div style={{ marginTop: 6, color: "#b91c1c", fontSize: 13 }}>
            Config error: {cfgErr}
          </div>
        ) : null}
      </div>

      {/* TAJUK / SESSION */}
      <div
        style={{
          border: "1px solid #ddd",
          borderRadius: 14,
          padding: 14,
          marginBottom: 14,
        }}
      >
        <div style={{ fontWeight: 700, marginBottom: 8 }}>
          TAJUK NOSS / SESSION
        </div>

        <input
          value={sessionId}
          onChange={(e) => {
            setSessionId(e.target.value);
            // bila tukar session baru, reset flag (akan diset semula melalui loadConfig jika dah lock)
            setAgreedOnce(false);
          }}
          placeholder="cth: Masjid / Office"
          style={{
            width: "100%",
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid #ccc",
            marginBottom: 10,
          }}
        />

        {/* Bahasa NOSS (ditetapkan fasilitator) */}
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Bahasa NOSS:</div>
          <select
            value={lang}
            disabled={langLocked}
            onChange={(e) => changeLang(e.target.value)}
            style={{
              padding: "8px 10px",
              borderRadius: 10,
              border: "1px solid #ccc",
              cursor: langLocked ? "not-allowed" : "pointer",
              minWidth: 220,
            }}
          >
            <option value="MS">Bahasa Melayu (MS)</option>
            <option value="EN">English (EN)</option>
          </select>

          <div style={{ fontSize: 12, opacity: 0.75 }}>
            Panel boleh input BM/EN. Output akan ikut bahasa ini selepas Agreed.
          </div>
        </div>

        {/* Freeze + Fullscreen */}
        <div style={{ marginTop: 12, display: "flex", gap: 10 }}>
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
              border: "1px solid #111",
              background: "#fff",
              cursor: "pointer",
            }}
          >
            Fullscreen
          </button>
        </div>

        <div style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>
          Nota: Freeze digunakan semasa perbincangan & pengesahan akhir.
        </div>
      </div>

      {/* SENARAI KAD */}
      <div
        style={{
          border: "1px solid #ddd",
          borderRadius: 14,
          padding: 14,
          position: "relative",
        }}
      >
        <div style={{ fontWeight: 700, marginBottom: 10 }}>
          SENARAI KAD (LIVE)
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
            gap: 10,
            minHeight: 160,
          }}
        >
          {cards.map((c) => (
            <div
              key={String(c.id)}
              style={{
                border: "1px solid #eee",
                borderRadius: 12,
                padding: 12,
                background: "#fafafa",
              }}
            >
              <div style={{ fontWeight: 700 }}>
                {String(c.activity || c.name || "").trim()}
              </div>
              <div style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>
                {c.time}
              </div>
            </div>
          ))}

          {cards.length === 0 && (
            <div style={{ fontSize: 14, opacity: 0.75 }}>
              Belum ada kad untuk session ini.
            </div>
          )}
        </div>

        {/* ✅ BUTANG BAHARU: Agreed + Cluster Page */}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 10,
            marginTop: 12,
          }}
        >
          <button
            onClick={doAgreedLockOnly}
            disabled={agreedOnce}
            style={{
              padding: "10px 16px",
              borderRadius: 12,
              border: "1px solid #111",
              background: agreedOnce ? "#666" : "#111",
              color: "#fff",
              cursor: agreedOnce ? "not-allowed" : "pointer",
              fontWeight: 700,
            }}
            title={
              agreedOnce
                ? "Sudah Agreed & senarai kad telah dikunci"
                : "Kunci senarai kad (Agreed)"
            }
          >
            Agreed
          </button>

          {agreedOnce && (
            <button
              onClick={goClusterPage}
              style={{
                padding: "10px 16px",
                borderRadius: 12,
                border: "1px solid #111",
                background: "#0b3c6d",
                color: "#fff",
                cursor: "pointer",
                fontWeight: 700,
              }}
              title="Teruskan ke Cluster Page"
            >
              Cluster Page
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
