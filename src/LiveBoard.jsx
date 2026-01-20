import React, { useEffect, useMemo, useState } from "react";

const API_BASE =
  (import.meta?.env?.VITE_API_BASE && String(import.meta.env.VITE_API_BASE)) ||
  "https://dacum-backend.onrender.com";

export default function LiveBoard({ onAgreed }) {
  const apiBase = useMemo(() => {
    const v = String(API_BASE || "").trim();
    if (!v) return "https://dacum-backend.onrender.com";
    return v.replace("onrenderer.com", "onrender.com").replace(/\/+$/, "");
  }, []);

  const [sessionId, setSessionId] = useState("Masjid");
  const [cards, setCards] = useState([]);
  const [freeze, setFreeze] = useState(false);

  // Bahasa NOSS (ditetapkan fasilitator)
  const [lang, setLang] = useState("MS"); // "MS" | "EN"
  const [langLocked, setLangLocked] = useState(false);
  const [langMsg, setLangMsg] = useState("");

  async function apiGet(path) {
    const r = await fetch(`${apiBase}${path}`);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j?.error || j?.message || `GET ${path} -> ${r.status}`);
    return j;
  }

  async function apiPost(path, body) {
    const r = await fetch(`${apiBase}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j?.error || j?.message || `POST ${path} -> ${r.status}`);
    return j;
  }

  // Load session config (lang, locked) bila session berubah
  useEffect(() => {
    let alive = true;
    async function loadCfg() {
      setLangMsg("");
      const sid = String(sessionId || "").trim();
      if (!sid) return;

      try {
        const cfg = await apiGet(`/api/session/config/${encodeURIComponent(sid)}`);
        if (!alive) return;
        const newLang = String(cfg?.lang || "MS").toUpperCase();
        setLang(newLang === "EN" ? "EN" : "MS");
        setLangLocked(!!cfg?.langLocked);
      } catch (e) {
        // Kalau endpoint belum wujud/temporarily fail, jangan crash UI
        if (!alive) return;
        setLangMsg(`Nota: Tak dapat load config bahasa (${String(e?.message || e)})`);
      }
    }
    loadCfg();
    return () => {
      alive = false;
    };
  }, [apiBase, sessionId]);

  async function changeLang(next) {
    const sid = String(sessionId || "").trim();
    if (!sid) return alert("Sila isi Session dulu.");

    const nextLang = String(next || "").toUpperCase() === "EN" ? "EN" : "MS";
    setLangMsg("");

    try {
      const out = await apiPost(`/api/session/config/${encodeURIComponent(sid)}`, { lang: nextLang });
      setLang(out.lang === "EN" ? "EN" : "MS");
      setLangLocked(!!out.langLocked);
      setLangMsg(`Bahasa NOSS ditetapkan: ${out.lang}`);
    } catch (e) {
      setLangMsg(String(e?.message || e));
      alert(String(e?.message || e));
    }
  }

  async function goAgreed() {
    const sid = String(sessionId || "").trim();
    if (!sid) return alert("Sila isi Session dulu.");

    // LOCK bahasa bila Agreed
    setLangMsg("");
    try {
      const out = await apiPost(`/api/session/lock/${encodeURIComponent(sid)}`, {});
      setLang(out.lang === "EN" ? "EN" : "MS");
      setLangLocked(true);
      setLangMsg(`Bahasa dikunci: ${out.lang}`);
    } catch (e) {
      // Jika lock endpoint belum ada, masih boleh teruskan (tapi Prof dah mahu lock — jadi kita alert)
      setLangMsg(String(e?.message || e));
      alert(`Gagal lock bahasa: ${String(e?.message || e)}`);
      return;
    }

    onAgreed?.(sid);
  }

  function goFullscreen() {
    const el = document.documentElement;
    if (!document.fullscreenElement) el.requestFullscreen?.();
    else document.exitFullscreen?.();
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
        const j = await r.json().catch(() => ({}));
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

  return (
    <div style={{ padding: 16, fontFamily: "system-ui, Arial" }}>
      <h2 style={{ margin: "0 0 10px" }}>Live Board (DACUM Card) — Fasilitator</h2>

      <div style={{ fontSize: 13, opacity: 0.9, marginBottom: 10 }}>
        Status: <b>{freeze ? "FREEZE" : "LIVE"}</b> | API: <code>{apiBase}</code> | Session: <b>{sessionId}</b>
      </div>

      {/* TAJUK / SESSION */}
      <div style={{ padding: 12, border: "1px solid #ddd", borderRadius: 12, marginBottom: 12 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>TAJUK NOSS / SESSION</div>

        <input
          value={sessionId}
          onChange={(e) => setSessionId(e.target.value)}
          placeholder="Contoh: Masjid / Office"
          style={{
            width: "100%",
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid #ccc",
            marginBottom: 12,
          }}
        />

        {/* Bahasa NOSS */}
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>
            Bahasa NOSS (ditetapkan fasilitator){" "}
            {langLocked ? <span style={{ fontWeight: 600 }}>(Locked)</span> : null}
          </div>

          <label style={{ marginRight: 14 }}>
            <input
              type="radio"
              name="lang"
              checked={lang === "MS"}
              disabled={langLocked}
              onChange={() => changeLang("MS")}
            />{" "}
            Bahasa Melayu (MS)
          </label>

          <label>
            <input
              type="radio"
              name="lang"
              checked={lang === "EN"}
              disabled={langLocked}
              onChange={() => changeLang("EN")}
            />{" "}
            English (EN)
          </label>

          <div style={{ marginTop: 6, fontSize: 12, opacity: 0.85 }}>
            Panel bebas masukkan aktiviti BM/EN. Selepas <b>Agreed</b>, semua hasil & edit hendaklah ikut bahasa yang
            ditetapkan.
          </div>

          {langMsg ? (
            <div style={{ marginTop: 6, fontSize: 12, color: "#111" }}>
              {langMsg}
            </div>
          ) : null}
        </div>

        {/* Freeze + Fullscreen + Agreed */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
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
              color: "#111",
              cursor: "pointer",
            }}
          >
            Fullscreen
          </button>

          <button
            onClick={goAgreed}
            style={{
              padding: "8px 14px",
              borderRadius: 10,
              border: "1px solid #16a34a",
              background: "#16a34a",
              color: "#fff",
              cursor: "pointer",
              marginLeft: "auto",
            }}
          >
            Agreed (Ke Clustering)
          </button>
        </div>

        <div style={{ marginTop: 8, fontSize: 12, opacity: 0.8 }}>
          Nota: Freeze digunakan semasa perbincangan & pengesahan akhir.
        </div>
      </div>

      {/* SENARAI KAD */}
      <div style={{ padding: 12, border: "1px solid #ddd", borderRadius: 12 }}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>SENARAI KAD (LIVE)</div>

        {cards.map((c, idx) => (
          <div key={String(c.id || idx)} style={{ padding: 10, border: "1px solid #eee", borderRadius: 10, marginBottom: 8 }}>
            <div style={{ fontWeight: 600 }}>{String(c.activity || c.name || c.title || "").trim()}</div>
            <div style={{ fontSize: 12, opacity: 0.8 }}>{c.time || c.createdAt || ""}</div>
          </div>
        ))}

        {cards.length === 0 ? (
          <div style={{ opacity: 0.8 }}>Belum ada kad untuk session ini.</div>
        ) : null}
      </div>
    </div>
  );
}
