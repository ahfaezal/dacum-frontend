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

function fmtTime(t) {
  if (!t) return "";
  // support ISO string
  try {
    const d = new Date(t);
    if (Number.isNaN(d.getTime())) return String(t);
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    const ss = String(d.getSeconds()).padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
  } catch {
    return String(t);
  }
}

function normalizeCard(raw, idx) {
  const text = String(raw?.activity || raw?.name || raw?.text || "").trim();
  const time = raw?.time || raw?.createdAt || "";
  const id = raw?.id || `${idx}-${time || "x"}`;
  return {
    id,
    text,
    time,
    panelName: raw?.panelName || "",
    source: raw?.source || "",
  };
}

function buildGrid(cards, cols) {
  const rows = [];
  for (let i = 0; i < cards.length; i += cols) rows.push(cards.slice(i, i + cols));
  return rows;
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

  // Paparan (grid seperti lama)
  const [cols, setCols] = useState(() => {
    // default: desktop 8 kolum (macam paparan lama), mobile akan auto turun
    const w = typeof window !== "undefined" ? window.innerWidth : 1200;
    if (w < 640) return 1;
    if (w < 900) return 3;
    if (w < 1200) return 6;
    return 8;
  });

  // Bahasa NOSS (ditetapkan fasilitator)
  const [lang, setLang] = useState("MS"); // MS | EN
  const [langLocked, setLangLocked] = useState(false);
  const [lockedAt, setLockedAt] = useState(null);

  const [cfgErr, setCfgErr] = useState("");
  const [boardErr, setBoardErr] = useState("");
  const [hydrated, setHydrated] = useState(false);

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
  // Responsive cols (ikut saiz skrin)
  // =========
  useEffect(() => {
    function onResize() {
      const w = window.innerWidth;
      let next = 8;
      if (w < 640) next = 1;
      else if (w < 900) next = 3;
      else if (w < 1200) next = 6;
      else next = 8;
      setCols(next);
    }
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

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
  // 3) Poll — baca S3 liveboard sahaja (single source of truth)
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

async function doUnlockSession() {
  const sid = String(sessionId || "").trim();
  if (!sid) return alert("Sila isi Session dulu.");

  const ok = window.confirm(
    "Anda pasti mahu UNLOCK session ini?\n\n" +
    "Panel akan boleh hantar kad semula dan sesi kembali LIVE."
  );
  if (!ok) return;

  try {
    const out = await apiPost(
      `/api/session/unlock/${encodeURIComponent(sid)}`
    );

    setLangLocked(false);
    setLockedAt(null);
    setFreeze(false);
    setAgreedOnce(false);

    alert("Session berjaya di-UNLOCK.");
  } catch (e) {
    alert(String(e?.message || e));
  }
}
  
  function goClusterPageNewTab() {
    const sid = String(sessionId || "").trim();
    if (!sid) return alert("Sila isi Session dulu.");

    // kalau parent nak handle, bagi peluang
    if (typeof onAgreed === "function") {
      onAgreed(sid);
      return;
    }

    const url = `${window.location.origin}${window.location.pathname}#/cluster?session=${encodeURIComponent(
      sid
    )}`;

    // buka tab baru
    window.open(url, "_blank", "noopener,noreferrer");
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

  // Normalize + sort by time asc (seperti flow input)
  const normalized = useMemo(() => {
    const arr = (Array.isArray(cards) ? cards : []).map(normalizeCard).filter((c) => c.text);
    arr.sort((a, b) => {
      const ta = new Date(a.time || 0).getTime();
      const tb = new Date(b.time || 0).getTime();
      return ta - tb;
    });
    return arr;
  }, [cards]);

  // Tag "BARU" pada kad paling akhir (latest)
  const latestId = useMemo(() => {
    if (!normalized.length) return "";
    return normalized[normalized.length - 1].id;
  }, [normalized]);

  const gridRows = useMemo(() => buildGrid(normalized, cols), [normalized, cols]);

  return (
    <div style={{ padding: 16, maxWidth: 1100, margin: "0 auto" }}>
      <h2 style={{ margin: "6px 0 10px" }}>Live Board (DACUM Card) — Fasilitator</h2>

      <div style={{ marginBottom: 10, fontSize: 14 }}>
        <b>Status:</b> {freeze ? "FREEZE" : "LIVE"} {" | "}
        <b>API:</b> <code>{apiBase}</code> {" | "}
        <b>Session:</b> {sessionId}
        <br />
        <b>Bahasa NOSS:</b> {langLabel} {" | "}
        <b>Lock:</b> {lockText}
      </div>

      {cfgErr ? (
        <div
          style={{
            padding: 10,
            borderRadius: 10,
            background: "#fee2e2",
            border: "1px solid #ef4444",
            marginBottom: 10,
          }}
        >
          <b>Config error:</b> {cfgErr}
        </div>
      ) : null}

      {boardErr ? (
        <div
          style={{
            padding: 10,
            borderRadius: 10,
            background: "#fffbeb",
            border: "1px solid #f59e0b",
            marginBottom: 10,
          }}
        >
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

      <div
        style={{
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          alignItems: "center",
          marginBottom: 10,
        }}
      >
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

      {/* ======= PAPARAN DACUM CARD (GRID LAMA) ======= */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>DACUM CARD (LIVE)</div>

        <div
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: 12,
            overflow: "hidden",
            padding: 12,
            background: "#fff",
          }}
        >
          {normalized.length === 0 ? (
            <div style={{ color: "#666" }}>Belum ada kad untuk session ini.</div>
          ) : (
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                tableLayout: "fixed",
              }}
            >
              <tbody>
                {gridRows.map((row, rIdx) => (
                  <tr key={`r-${rIdx}`}>
                    {row.map((c) => {
                      const isNew = c.id === latestId;
                      return (
                        <td
                          key={c.id}
                          style={{
                            border: "1px solid #111",
                            padding: 10,
                            verticalAlign: "top",
                            height: 96,
                            background: isNew ? "#fff7ed" : "#fff",
                          }}
                        >
                          <div style={{ fontWeight: 800, lineHeight: 1.2 }}>
                            {c.text}
                          </div>
                          <div style={{ marginTop: 8, fontSize: 12, color: "#444", display: "flex", justifyContent: "space-between" }}>
                            <span>{fmtTime(c.time)}</span>
                            {isNew ? (
                              <span
                                style={{
                                  fontSize: 11,
                                  fontWeight: 800,
                                  padding: "2px 8px",
                                  borderRadius: 999,
                                  border: "1px solid #111",
                                  background: "#111",
                                  color: "#fff",
                                }}
                              >
                                BARU
                              </span>
                            ) : null}
                          </div>
                        </td>
                      );
                    })}

                    {/* pad kosong untuk lengkapkan kolum */}
                    {row.length < cols
                      ? Array.from({ length: cols - row.length }).map((_, i) => (
                          <td
                            key={`empty-${rIdx}-${i}`}
                            style={{
                              border: "1px solid #111",
                              padding: 10,
                              height: 96,
                              background: "#fff",
                            }}
                          />
                        ))
                      : null}
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div style={{ marginTop: 10, fontSize: 12, color: "#666" }}>
            Tip: Ini paparan “raw + timestamp” (belum grouping). Clustering CU dibuat selepas cukup input.
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {/* AGREE (hanya bila belum lock) */}
        {!langLocked && (
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
        )}

        {/* CLUSTER PAGE – TAB BARU (lepas Agreed) */}
        {agreedOnce && (
          <button
            onClick={goClusterPageNewTab}
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
            Cluster Page (Tab Baru)
          </button>
        )}

        {/* UNLOCK (hanya bila session dikunci) */}
        {langLocked && (
          <button
            onClick={doUnlockSession}
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid #b91c1c",
              background: "#b91c1c",
              color: "#fff",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            Unlock Session
          </button>
        )}
      </div>
    </div>
  );
}
