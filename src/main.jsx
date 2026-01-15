import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";

/**
 * CONFIG
 */
const API_BASE =
  (import.meta?.env?.VITE_API_BASE && String(import.meta.env.VITE_API_BASE)) ||
  "https://dacum-backend.onrender.com";

const COLUMNS = 8;               // jadual 8 kolum macam contoh
const POLL_MS = 1500;            // auto update tanpa refresh (sementara socket)

/**
 * Utils
 */
function formatTime(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString("ms-MY", { hour12: false });
  } catch {
    return "";
  }
}
function sortByTimeAsc(items) {
  return [...items].sort((a, b) => new Date(a.time) - new Date(b.time));
}
function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Simple router (tanpa react-router)
 */
function usePath() {
  const [path, setPath] = useState(window.location.pathname || "/");
  useEffect(() => {
    const onPop = () => setPath(window.location.pathname || "/");
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  return [path, setPath];
}

function navigate(to, setPath) {
  window.history.pushState({}, "", to);
  setPath(to);
}

/**
 * Shared hook: fetch cards by session
 */
function useCards(sessionId) {
  const [cards, setCards] = useState([]);
  const [status, setStatus] = useState("checking...");
  const [error, setError] = useState("");
  const lastJsonRef = useRef("");

  async function fetchCards() {
    const sid = (sessionId || "").trim();
    if (!sid) return;

    try {
      const res = await fetch(`${API_BASE}/cards/${encodeURIComponent(sid)}`);
      if (!res.ok) throw new Error(`GET gagal (${res.status})`);
      const data = await res.json();

      const json = JSON.stringify(data);
      if (json !== lastJsonRef.current) {
        lastJsonRef.current = json;
        setCards(Array.isArray(data) ? data : []);
      }

      setStatus(`connected | API: ${API_BASE}`);
      setError("");
    } catch (e) {
      setStatus("disconnected");
      setError(e?.message || "Failed to fetch");
    }
  }

  useEffect(() => {
    fetchCards();
    const t = setInterval(fetchCards, POLL_MS);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  return { cards, status, error, refetch: fetchCards };
}

/**
 * PANEL VIEW (telefon) — hanya borang input
 */
function PanelPage() {
  const [sessionId, setSessionId] = useState("dacum-demo");
  const [name, setName] = useState("");
  const [activity, setActivity] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  async function submitCard(e) {
    e.preventDefault();
    setErr("");
    setMsg("");

    const sid = sessionId.trim();
    const nm = name.trim();
    const act = activity.trim();

    if (!sid) return setErr("Session/Workshop ID diperlukan.");
    if (!nm) return setErr("Nama diperlukan.");
    if (!act) return setErr("Maklumat Aktiviti Kerja diperlukan.");

    try {
      const res = await fetch(`${API_BASE}/cards/${encodeURIComponent(sid)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nm, activity: act }),
      });
      if (!res.ok) throw new Error(`POST gagal (${res.status})`);

      setActivity("");
      setMsg("✅ Berjaya dihantar.");
      setTimeout(() => setMsg(""), 1500);
    } catch (e2) {
      setErr(e2?.message || "Gagal submit");
    }
  }

  return (
    <div style={{ ...styles.page, maxWidth: 520 }}>
      <h1 style={styles.title}>Panel Input</h1>
      <div style={styles.subTitle}>
        (Telefon) Isi aktiviti sahaja. Paparan board adalah anonim.
      </div>

      <div style={styles.card}>
        <form onSubmit={submitCard}>
          <label style={styles.label}>Session/Workshop ID</label>
          <input
            style={styles.input}
            value={sessionId}
            onChange={(e) => setSessionId(e.target.value)}
            placeholder="contoh: dacum-demo"
          />
          <div style={styles.tip}>
            Tip: guna session berbeza untuk workshop berbeza.
          </div>

          <label style={styles.label}>Nama</label>
          <input
            style={styles.input}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nama panel (tidak dipaparkan di board)"
          />

          <label style={styles.label}>Maklumat Aktiviti Kerja</label>
          <textarea
            style={styles.textarea}
            value={activity}
            onChange={(e) => setActivity(e.target.value)}
            placeholder="Contoh: Imamkan solat fardu…"
            rows={5}
          />

          <button type="submit" style={styles.button}>
            Hantar Aktiviti
          </button>

          {err ? <div style={styles.error}>⚠ {err}</div> : null}
          {msg ? <div style={styles.success}>{msg}</div> : null}

          <div style={styles.footerNote}>
            * Versi awal: nanti kita tambah scan QR sebenar.
          </div>
        </form>
      </div>

      <div style={styles.smallLinks}>
        <div style={{ opacity: 0.75, marginBottom: 8 }}>Link berkaitan:</div>
        <code style={styles.codeBlock}>/board</code> untuk paparan fasilitator (anonim)
      </div>
    </div>
  );
}

/**
 * BOARD VIEW (komputer/TV) — live + anonim (tiada nama)
 */
function BoardPage() {
  const [sessionId, setSessionId] = useState("dacum-demo");
  const { cards, status, error } = useCards(sessionId);

  const sortedCards = useMemo(() => sortByTimeAsc(cards), [cards]);
  const rows = useMemo(() => chunk(sortedCards, COLUMNS), [sortedCards]);

  return (
    <div style={styles.page}>
      <div style={styles.headerRow}>
        <div>
          <h1 style={styles.title}>Live Board (Anonim)</h1>
          <div style={styles.subTitle}>
            Status: <b>{status}</b> | Session: <b>{sessionId}</b>
          </div>
          {error ? <div style={styles.error}>⚠ {error}</div> : null}
        </div>

        <div style={styles.sessionBox}>
          <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 6 }}>
            Tukar Session
          </div>
          <input
            style={{ ...styles.input, marginTop: 0 }}
            value={sessionId}
            onChange={(e) => setSessionId(e.target.value)}
            placeholder="dacum-demo"
          />
          <div style={styles.tip}>
            Paparan ini sengaja tidak tunjuk nama panel (untuk keselesaan).
          </div>
        </div>
      </div>

      <div style={styles.card}>
        {sortedCards.length === 0 ? (
          <div style={styles.empty}>Belum ada aktiviti. Panel boleh mula hantar.</div>
        ) : (
          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <tbody>
                {rows.map((row, rIdx) => (
                  <tr key={rIdx}>
                    {Array.from({ length: COLUMNS }).map((_, cIdx) => {
                      const item = row[cIdx];
                      return (
                        <td key={cIdx} style={styles.td}>
                          {item ? (
                            <div>
                              <div style={styles.cellText}>{item.activity}</div>
                              <div style={styles.cellMeta}>
                                <span style={styles.timeOnly}>{formatTime(item.time)}</span>
                              </div>
                            </div>
                          ) : (
                            <div style={styles.cellEmpty}>&nbsp;</div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div style={styles.hint}>
          Tip: Ini paparan “raw + timestamp” (belum grouping). Klustering CU dibuat selepas cukup input.
        </div>
      </div>
    </div>
  );
}

/**
 * HOME: redirect
 */
function Home({ setPath }) {
  useEffect(() => {
    // default pergi ke /panel
    if (window.location.pathname === "/") {
      navigate("/panel", setPath);
    }
  }, [setPath]);

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div>Redirecting…</div>
      </div>
    </div>
  );
}

/**
 * App Router
 */
function App() {
  const [path, setPath] = usePath();

  // simple guards
  const clean = (path || "/").replace(/\/+$/, "") || "/";

  return (
    <>
      {clean === "/" ? <Home setPath={setPath} /> : null}
      {clean === "/panel" ? <PanelPage /> : null}
      {clean === "/board" ? <BoardPage /> : null}

      {/* Jika path lain */}
      {clean !== "/" && clean !== "/panel" && clean !== "/board" ? (
        <div style={styles.page}>
          <div style={styles.card}>
            <h2 style={{ marginTop: 0 }}>Page tidak ditemui</h2>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button style={styles.button} onClick={() => navigate("/panel", setPath)}>
                Pergi ke /panel
              </button>
              <button style={styles.button} onClick={() => navigate("/board", setPath)}>
                Pergi ke /board
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

/**
 * Styles
 */
const styles = {
  page: {
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
    padding: "24px",
    maxWidth: "1200px",
    margin: "0 auto",
  },
  headerRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: "14px",
    flexWrap: "wrap",
    marginBottom: "12px",
  },
  sessionBox: {
    minWidth: 260,
    background: "#fff",
    border: "1px solid #e6e6e6",
    borderRadius: 12,
    padding: 12,
    boxShadow: "0 1px 8px rgba(0,0,0,0.04)",
  },
  title: { margin: 0, fontSize: "34px", fontWeight: 800 },
  subTitle: { marginTop: 6, opacity: 0.8, fontSize: 14 },

  card: {
    background: "#fff",
    border: "1px solid #e6e6e6",
    borderRadius: 12,
    padding: 16,
    boxShadow: "0 1px 8px rgba(0,0,0,0.04)",
  },
  label: { display: "block", fontSize: 13, fontWeight: 800, marginTop: 10 },
  input: {
    width: "100%",
    marginTop: 6,
    padding: "10px 10px",
    borderRadius: 10,
    border: "1px solid #ddd",
    outline: "none",
  },
  textarea: {
    width: "100%",
    marginTop: 6,
    padding: "10px 10px",
    borderRadius: 10,
    border: "1px solid #ddd",
    outline: "none",
    resize: "vertical",
  },
  tip: { marginTop: 6, fontSize: 12, opacity: 0.75 },

  button: {
    width: "100%",
    marginTop: 12,
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #ddd",
    cursor: "pointer",
    fontWeight: 800,
  },
  error: { marginTop: 10, color: "#b00020", fontSize: 13 },
  success: { marginTop: 10, color: "#0a7a2f", fontSize: 13, fontWeight: 700 },
  footerNote: { marginTop: 10, fontSize: 12, opacity: 0.75 },

  empty: { marginTop: 8, opacity: 0.8 },
  tableWrap: { marginTop: 8, overflowX: "auto" },
  table: { borderCollapse: "collapse", width: "100%", minWidth: "900px" },
  td: {
    border: "1px solid #000",
    verticalAlign: "top",
    width: `${100 / COLUMNS}%`,
    padding: 8,
    height: 78,
  },
  cellText: { fontSize: 13, lineHeight: 1.2, fontWeight: 700 },
  cellMeta: { marginTop: 6, display: "flex", gap: 8, alignItems: "center" },
  timeOnly: { fontSize: 11, opacity: 0.75 },

  cellEmpty: { opacity: 0.12 },
  hint: { marginTop: 12, fontSize: 12, opacity: 0.7 },

  smallLinks: { marginTop: 14, fontSize: 13 },
  codeBlock: {
    display: "inline-block",
    padding: "6px 10px",
    borderRadius: 10,
    border: "1px solid #ddd",
    background: "#f7f7f7",
  },
};

createRoot(document.getElementById("root")).render(<App />);
