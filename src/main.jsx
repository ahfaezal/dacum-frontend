import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";

/**
 * ===========
 * CONFIG
 * ===========
 * Backend tuan (Render) - boleh tukar jika URL berubah.
 */
const API_BASE =
  (import.meta?.env?.VITE_API_BASE && String(import.meta.env.VITE_API_BASE)) ||
  "https://dacum-backend.onrender.com";

/**
 * Util: format masa ringkas
 */
function formatTime(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString("ms-MY", { hour12: false });
  } catch {
    return iso || "";
  }
}

/**
 * Util: susun mengikut masa (oldest -> newest)
 */
function sortByTimeAsc(items) {
  return [...items].sort((a, b) => {
    const ta = new Date(a.time).getTime();
    const tb = new Date(b.time).getTime();
    return ta - tb;
  });
}

/**
 * ===========
 * MAIN APP
 * ===========
 */
function App() {
  // Panel input
  const [sessionId, setSessionId] = useState("dacum-demo");
  const [name, setName] = useState("");
  const [activity, setActivity] = useState("");

  // Data cards
  const [cards, setCards] = useState([]);
  const [status, setStatus] = useState("checking...");
  const [error, setError] = useState("");

  // View mode
  const [viewMode, setViewMode] = useState("table"); // "table" | "list"
  const COLUMNS = 8; // ikut gambar tuan

  // Untuk elak setState loop bila polling
  const lastJsonRef = useRef("");

  /**
   * Fetch cards (GET)
   */
  async function fetchCards() {
    if (!sessionId?.trim()) return;
    setError("");

    try {
      const res = await fetch(`${API_BASE}/cards/${encodeURIComponent(sessionId.trim())}`);
      if (!res.ok) throw new Error(`GET gagal (${res.status})`);
      const data = await res.json();

      // elak render jika tiada perubahan
      const json = JSON.stringify(data);
      if (json !== lastJsonRef.current) {
        lastJsonRef.current = json;
        setCards(Array.isArray(data) ? data : []);
      }

      setStatus(`connected | API: ${API_BASE}`);
    } catch (e) {
      setStatus("disconnected");
      setError(e?.message || "Gagal fetch data");
    }
  }

  /**
   * Polling (auto update tanpa refresh) - sebelum kita aktifkan Socket.IO
   */
  useEffect(() => {
    fetchCards();
    const t = setInterval(fetchCards, 1500);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  /**
   * Submit card (POST)
   * Backend biasanya menerima body: { name, activity }
   */
  async function submitCard(e) {
    e.preventDefault();
    setError("");

    const sid = sessionId.trim();
    const nm = name.trim();
    const act = activity.trim();

    if (!sid) return setError("Session/Workshop ID diperlukan.");
    if (!nm) return setError("Nama diperlukan.");
    if (!act) return setError("Maklumat Aktiviti Kerja diperlukan.");

    try {
      const res = await fetch(`${API_BASE}/cards/${encodeURIComponent(sid)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nm, activity: act }),
      });

      if (!res.ok) throw new Error(`POST gagal (${res.status})`);

      setActivity("");
      // terus fetch supaya nampak cepat
      await fetchCards();
    } catch (e2) {
      setError(e2?.message || "Gagal submit");
    }
  }

  /**
   * Data siap susun
   */
  const sortedCards = useMemo(() => sortByTimeAsc(cards), [cards]);

  /**
   * Bina grid jadual (8 kolum)
   */
  const tableRows = useMemo(() => {
    const rows = [];
    for (let i = 0; i < sortedCards.length; i += COLUMNS) {
      rows.push(sortedCards.slice(i, i + COLUMNS));
    }
    return rows;
  }, [sortedCards]);

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h1 style={styles.title}>Digital DACUM</h1>
        <div style={styles.subTitle}>
          Status: <b>{status}</b> | API: <code>{API_BASE}</code>
        </div>
      </div>

      <div style={styles.grid2}>
        {/* LEFT: INPUT */}
        <div style={styles.card}>
          <h3 style={styles.h3}>Panel Input (Simulasi QR)</h3>

          <form onSubmit={submitCard}>
            <label style={styles.label}>Session/Workshop ID</label>
            <input
              style={styles.input}
              value={sessionId}
              onChange={(e) => setSessionId(e.target.value)}
              placeholder="contoh: dacum-demo"
            />
            <div style={styles.tip}>Tip: guna session berbeza untuk workshop berbeza.</div>

            <label style={styles.label}>Nama</label>
            <input
              style={styles.input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nama panel"
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
              Submit
            </button>

            {error ? <div style={styles.error}>⚠ {error}</div> : null}

            <div style={styles.footerNote}>
              * Ini versi awal. Nanti kita tambah scan QR sebenar (kamera phone).
            </div>
          </form>
        </div>

        {/* RIGHT: LIVE BOARD */}
        <div style={styles.card}>
          <div style={styles.boardHeader}>
            <h3 style={styles.h3}>Live Board</h3>

            <div style={styles.toggleWrap}>
              <button
                onClick={() => setViewMode("table")}
                style={{
                  ...styles.toggleBtn,
                  ...(viewMode === "table" ? styles.toggleBtnActive : null),
                }}
                type="button"
              >
                Jadual
              </button>
              <button
                onClick={() => setViewMode("list")}
                style={{
                  ...styles.toggleBtn,
                  ...(viewMode === "list" ? styles.toggleBtnActive : null),
                }}
                type="button"
              >
                Senarai
              </button>
            </div>
          </div>

          {sortedCards.length === 0 ? (
            <div style={styles.empty}>Belum ada DACUM card. Cuba submit satu.</div>
          ) : viewMode === "table" ? (
            <div style={styles.tableWrap}>
              <table style={styles.table}>
                <tbody>
                  {tableRows.map((row, rIdx) => (
                    <tr key={rIdx}>
                      {Array.from({ length: COLUMNS }).map((_, cIdx) => {
                        const item = row[cIdx];
                        return (
                          <td key={cIdx} style={styles.td}>
                            {item ? (
                              <div>
                                <div style={styles.cellText}>{item.activity}</div>
                                <div style={styles.cellMeta}>
                                  <span style={styles.badge}>{item.name}</span>
                                  <span style={styles.time}>{formatTime(item.time)}</span>
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
          ) : (
            <div style={styles.listWrap}>
              {sortedCards.map((item) => (
                <div key={item.id} style={styles.listItem}>
                  <div style={styles.listActivity}>{item.activity}</div>
                  <div style={styles.listMeta}>
                    <span style={styles.badge}>{item.name}</span>
                    <span style={styles.time}>{formatTime(item.time)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div style={styles.hint}>
            Tip: Paparan Jadual ini memang “raw + timestamp” (belum grouping). Klustering CU dibuat pada fasa seterusnya.
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * ===========
 * STYLES (simple, inline)
 * ===========
 */
const styles = {
  page: {
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
    padding: "28px",
    maxWidth: "1200px",
    margin: "0 auto",
  },
  header: { marginBottom: "18px" },
  title: { margin: 0, fontSize: "34px", fontWeight: 800, letterSpacing: 0.2 },
  subTitle: { marginTop: "6px", opacity: 0.8, fontSize: "14px" },
  grid2: { display: "grid", gridTemplateColumns: "1fr 1.5fr", gap: "18px" },
  card: {
    background: "#fff",
    border: "1px solid #e6e6e6",
    borderRadius: "12px",
    padding: "16px",
    boxShadow: "0 1px 8px rgba(0,0,0,0.04)",
  },
  h3: { margin: 0, marginBottom: "10px", fontSize: "16px" },
  label: { display: "block", fontSize: "13px", fontWeight: 700, marginTop: "10px" },
  input: {
    width: "100%",
    marginTop: "6px",
    padding: "10px 10px",
    borderRadius: "10px",
    border: "1px solid #ddd",
    outline: "none",
  },
  textarea: {
    width: "100%",
    marginTop: "6px",
    padding: "10px 10px",
    borderRadius: "10px",
    border: "1px solid #ddd",
    outline: "none",
    resize: "vertical",
  },
  tip: { marginTop: "6px", fontSize: "12px", opacity: 0.7 },
  button: {
    width: "100%",
    marginTop: "12px",
    padding: "10px 12px",
    borderRadius: "10px",
    border: "1px solid #ddd",
    cursor: "pointer",
    fontWeight: 700,
  },
  error: { marginTop: "10px", color: "#b00020", fontSize: "13px" },
  footerNote: { marginTop: "10px", fontSize: "12px", opacity: 0.7 },
  boardHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" },
  toggleWrap: { display: "flex", gap: "8px" },
  toggleBtn: {
    padding: "8px 10px",
    borderRadius: "10px",
    border: "1px solid #ddd",
    background: "#fff",
    cursor: "pointer",
    fontWeight: 700,
    fontSize: "12px",
  },
  toggleBtnActive: { background: "#111", color: "#fff", border: "1px solid #111" },
  empty: { marginTop: "14px", opacity: 0.75 },
  tableWrap: { marginTop: "12px", overflowX: "auto" },
  table: { borderCollapse: "collapse", width: "100%", minWidth: "900px" },
  td: {
    border: "1px solid #000",
    verticalAlign: "top",
    width: "12.5%",
    padding: "8px",
    height: "74px",
  },
  cellText: { fontSize: "13px", lineHeight: 1.2, fontWeight: 600 },
  cellMeta: { marginTop: "6px", display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" },
  badge: {
    display: "inline-block",
    padding: "2px 8px",
    borderRadius: "999px",
    border: "1px solid #ddd",
    fontSize: "11px",
    fontWeight: 700,
    background: "#f7f7f7",
  },
  time: { fontSize: "11px", opacity: 0.75 },
  cellEmpty: { opacity: 0.15 },
  listWrap: { marginTop: "12px", display: "grid", gap: "10px" },
  listItem: { border: "1px solid #eee", borderRadius: "10px", padding: "10px" },
  listActivity: { fontWeight: 700, fontSize: "13px" },
  listMeta: { marginTop: "6px", display: "flex", gap: "8px", alignItems: "center" },
  hint: { marginTop: "12px", fontSize: "12px", opacity: 0.7 },
};

createRoot(document.getElementById("root")).render(<App />);
