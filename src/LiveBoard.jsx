import React, { useEffect, useMemo, useRef, useState } from "react";

const API_BASE =
  (import.meta?.env?.VITE_API_BASE && String(import.meta.env.VITE_API_BASE)) ||
  "https://dacum-backend.onrender.com";

/**
 * Ambil query param daripada:
 * 1) window.location.search  -> ?session=Office-v3
 * 2) window.location.hash    -> #/board?session=Office-v3
 */
function getQueryParam(name) {
  // 1) normal query: ?session=...
  const s = new URLSearchParams(window.location.search);
  const v1 = s.get(name);
  if (v1) return v1;

  // 2) hash query: #/board?session=...
  const h = window.location.hash || "";
  const qIndex = h.indexOf("?");
  if (qIndex === -1) return "";
  const qs = h.slice(qIndex + 1);
  const hs = new URLSearchParams(qs);
  return hs.get(name) || "";
}

export default function LiveBoard({ onAgreed }) {
  const apiBase = useMemo(() => {
    const v = String(API_BASE || "").trim();
    if (!v) return "https://dacum-backend.onrender.com";
    return v.replace("onrenderer.com", "onrender.com").replace(/\/+$/, "");
  }, []);

  // SESSION
  const [sessionId, setSessionId] = useState(() => {
    return String(getQueryParam("session") || "Masjid").trim();
  });

  // UI state
  const [agreedOnce, setAgreedOnce] = useState(false);
  const [cards, setCards] = useState([]);
  const [freeze, setFreeze] = useState(false);

  // Bahasa NOSS (ditetapkan fasilitator)
  const [lang, setLang] = useState("MS"); // MS | EN
  const [langLocked, setLangLocked] = useState(false);
  const [lockedAt, setLockedAt] = useState(null);

  const [cfgErr, setCfgErr] = useState("");
  const [boardErr, setBoardErr] = useState("");
  const [hydrated, setHydrated] = useState(false); // elak autosave sebelum load

  const saveTimer = useRef(null);

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

  // =========
  // 1) Load CONFIG bila sessionId berubah
  // =========
  useEffect(() => {
    let alive = true;

    async function loadConfig() {
      setCfgErr("");
      const sid = String(sessionId || "").trim();
      if (!sid) return;

      try {
        const cfg = await apiGet(`/api/session/config/${encodeURIComponent(sid)}`);
        if (!alive) return;

        const nextLang = String(cfg?.lang || "MS").toUpperCase();
        setLang(nextLang === "EN" ? "EN" : "MS");
        setLangLocked(!!cfg?.langLocked);
        setLockedAt(cfg?.lockedAt || null);

        // jika session dah pernah lock sebelum ini, anggap sudah Agreed
        if (cfg?.langLocked) {
          setAgreedOnce(true);
          setFreeze(true);
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

  // =========
  // 2) Load LIVEBOARD dari S3 ikut session
  // =========
  useEffect(() => {
    let alive = true;

    async function loadBoardFromS3() {
      setBoardErr("");
      setHydrated(false);

      const sid = String(sessionId || "").trim();
      if (!sid) return;

      try {
        const out = await apiGet(`/api/liveboard/${encodeURIComponent(sid)}`);
        if (!alive) return;

        const data = out?.data || {};
        const nextCards = Array.isArray(data?.cards) ? data.cards : [];

        setCards(nextCards);
        setHydrated(true);
      } catch (e) {
        // fallback: kalau endpoint S3 belum wujud, jangan “mati”
        if (!alive) return;
        setBoardErr(String(e?.message || e));
        setHydrated(true);
      }
    }

    loadBoardFromS3();
    return () => {
      alive = false;
    };
  }, [apiBase, sessionId]);

  // =========
  // 3) Poll — utamakan S3 liveboard; fallback ke endpoint lama /api/cards
  // =========
  useEffect(() => {
    if (freeze) return;

    let alive = true;

  async function tick() {
    if (!alive) return;

    const sid = String(sessionId || "").trim();
    if (!sid) return;

    try {
      const out = await apiGet(`/api/liveboard/${encodeURIComponent(sid)}`);
      if (!alive) return;

      const data = out?.data || {};
      const nextCards = Array.isArray(data?.cards) ? data.cards : [];
      setCards(nextCards);
    } catch {
      // senyap je – elak ganggu fasilitator
    }
  }

    tick();
    const t = setInterval(tick, 1200);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [apiBase, sessionId, freeze]);

  // =========
  // Actions
  // =========
  async function changeLang(next) {
    const sid = String(sessionId || "").trim();
    if (!sid) return alert("Sila isi Session dulu.");

    const nextLang = String(next || "").toUpperCase().trim();
    if (!["MS", "EN"].includes(nextLang)) return;

    if (langLocked) {
      alert("Bahasa sudah dikunci selepas Agreed.\nTidak boleh ubah lagi.");
      return;
    }

    setCfgErr("");
    setLang(nextLang);

    try {
      const out = await apiPost(`/api/session/config/${encodeURIComponent(sid)}`, {
        lang: nextLang,
      });
      setLang(String(out?.lang || nextLang).toUpperCase());
      setLangLocked(!!out?.langLocked);
      setLockedAt(out?.lockedAt || null);
    } catch (e) {
      setCfgErr(String(e?.message || e));
      alert(String(e?.message || e));
    }
  }

  // Agreed hanya LOCK (tidak navigate)
  async function doAgreedLockOnly() {
    const sid = String(sessionId || "").trim();
    if (!sid) return alert("Sila isi Session dulu.");

    // Freeze senarai kad (kunci perbincangan)
    setFreeze(true);

    // Pastikan config lang disimpan (kalau belum lock)
    try {
      if (!langLocked) {
        await apiPost(`/api/session/config/${encodeURIComponent(sid)}`, { lang });
      }
    } catch {}

    // Lock bahasa (wajib sebelum clustering)
    try {
      const lock = await apiPost(`/api/session/lock/${encodeURIComponent(sid)}`);
      setLang(String(lock?.lang || lang).toUpperCase());
      setLangLocked(true);
      setLockedAt(lock?.lockedAt || new Date().toISOString());
    } catch (e) {
      const msg = String(e?.message || e);
      if (!/sudah dikunci|locked/i.test(msg)) {
        alert(msg);
        setFreeze(false);
        return;
      }
      setLangLocked(true);
    }

    setAgreedOnce(true);
  }

  function goClusterPage() {
    const sid = String(sessionId || "").trim();
    if (!sid) return alert("Sila isi Session dulu.");

    if (typeof onAgreed === "function") {
      onAgreed(sid);
      return;
    }

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
    <div style={{ padding: 16, maxWidth: 900, margin: "0 auto" }}>
      <h2 style={{ margin: "6px 0 10px" }}>
        Live Board (DACUM Card) — Fasilitator
      </h2>

      <div style={{ marginBottom: 10, fontSize: 14 }}>
        <b>Status:</b> {freeze ? "FREEZE" : "LIVE"} {" | "}
        <b>API:</b> <code>{apiBase}</code> {" | "}
        <b>Session:</b> {sessionId}
        <br />
        <b>Bahasa NOSS:</b> {langLabel} {" | "}
        <b>Lock:</b> {lockText}
      </div>

      {cfgErr ? (
        <div style={{ padding: 10, borderRadius: 10, background: "#fee2e2", border: "1px solid #ef4444", marginBottom: 10 }}>
          <b>Config error:</b> {cfgErr}
        </div>
      ) : null}

      {boardErr ? (
        <div style={{ padding: 10, borderRadius: 10, background: "#fffbeb", border: "1px solid #f59e0b", marginBottom: 10 }}>
          <b>LiveBoard (S3) belum tersedia / fallback aktif:</b> {boardErr}
        </div>
      ) : null}

      <div style={{ marginBottom: 12 }}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>TAJUK NOSS / SESSION</div>
        <input
          value={sessionId}
          onChange={(e) => {
            setSessionId(e.target.value);
            setAgreedOnce(false);
          }}
          placeholder="cth: Masjid / Office"
          style={{
            width: "100%",
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid #ccc",
          }}
        />
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
        <div style={{ fontWeight: 700 }}>Bahasa NOSS:</div>
        <select
          value={lang}
          onChange={(e) => changeLang(e.target.value)}
          style={{
            padding: "8px 10px",
            borderRadius: 10,
            border: "1px solid #ccc",
            cursor: langLocked ? "not-allowed" : "pointer",
            minWidth: 220,
          }}
          disabled={langLocked}
        >
          <option value="MS">Bahasa Melayu (MS)</option>
          <option value="EN">English (EN)</option>
        </select>

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
            background: "#111",
            color: "#fff",
            cursor: "pointer",
          }}
        >
          Fullscreen
        </button>
      </div>

      <div style={{ fontSize: 13, color: "#444", marginBottom: 14 }}>
        Panel boleh input BM/EN. Output akan ikut bahasa ini selepas Agreed.
        <br />
        Nota: Freeze digunakan semasa perbincangan & pengesahan akhir.
      </div>

      <div style={{ marginBottom: 10 }}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>SENARAI KAD</div>

        <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden" }}>
          {cards.map((c, idx) => (
            <div
              key={c?.id || `${idx}`}
              style={{
                padding: "10px 12px",
                borderBottom: idx === cards.length - 1 ? "none" : "1px solid #e5e7eb",
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <div style={{ fontWeight: 600 }}>
                {String(c?.activity || c?.name || "").trim()}
              </div>
              <div style={{ fontSize: 12, color: "#555", whiteSpace: "nowrap" }}>
                {c?.time || ""}
              </div>
            </div>
          ))}

          {cards.length === 0 && (
            <div style={{ padding: "12px", color: "#666" }}>
              Belum ada kad untuk session ini.
            </div>
          )}
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button
          onClick={doAgreedLockOnly}
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid #111",
            background: "#111",
            color: "#fff",
            cursor: "pointer",
            fontWeight: 700,
          }}
        >
          Agreed
        </button>

        {agreedOnce && (
          <button
            onClick={goClusterPage}
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid #111",
              background: "#fff",
              color: "#111",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            Cluster Page
          </button>
        )}
      </div>
    </div>
  );
}
