import { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";

/**
 * CONFIG
 */
const API_BASE =
  (import.meta?.env?.VITE_API_BASE && String(import.meta.env.VITE_API_BASE)) ||
  "https://dacum-backend.onrender.com";

const COLUMNS = 8; // jadual 8 kolum macam contoh
const POLL_MS = 1500; // auto update tanpa refresh (sementara socket)

const LAST_SESSION_KEY = "dacum_last_session";

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

function safeGetLastSession() {
  try {
    const v = localStorage.getItem(LAST_SESSION_KEY);
    return (v || "").trim();
  } catch {
    return "";
  }
}

function safeSetLastSession(v) {
  try {
    localStorage.setItem(LAST_SESSION_KEY, (v || "").trim());
  } catch {
    // ignore
  }
}

/**
 * Simple router (tanpa react-router)
 */
function usePath() {
  const [path, setPath] = useState(window.location.pathname);

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
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
  }, [sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  return { cards, status, error, refetch: fetchCards };
}

/**
 * PANEL VIEW (telefon) — hanya borang input
 */
function PanelPage() {
  const [sessionId, setSessionId] = useState(() => safeGetLastSession());
  const [name, setName] = useState("");
  const [activity, setActivity] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  // auto-save session bila berubah
  useEffect(() => {
    if ((sessionId || "").trim()) safeSetLastSession(sessionId);
  }, [sessionId]);

  function useLastSession() {
    const last = safeGetLastSession();
    if (last) setSessionId(last);
  }

  function clearSession() {
    setSessionId("");
    try {
      localStorage.removeItem(LAST_SESSION_KEY);
    } catch {
      // ignore
    }
  }

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

      safeSetLastSession(sid);
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

          <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
            <button type="button" style={{ ...styles.smallBtn, width: "auto" }} onClick={useLastSession}>
              Guna Session Terakhir
            </button>
            <button type="button" style={{ ...styles.smallBtn, width: "auto" }} onClick={clearSession}>
              Clear Session
            </button>
          </div>

          <div style={styles.tip}>
            Tip: Session akan auto-simpan selepas anda isi sekali.
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
        </form>
      </div>
    </div>
  );
}

/**
 * BOARD VIEW (komputer/TV) — live + anonim (tiada nama)
 */
function BoardPage({ setPath, setClusterResult }) {
  const [sessionId, setSessionId] = useState(() => safeGetLastSession() || "dacum-demo");

  // auto-save session bila berubah
  useEffect(() => {
    if ((sessionId || "").trim()) safeSetLastSession(sessionId);
  }, [sessionId]);

  // LIVE CONTROL
  const [isFrozen, setIsFrozen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Cards (polling) — kita freeze di UI (bukan stop fetch) supaya stabil
  const { cards, status, error } = useCards(sessionId);

  // Simpan snapshot bila freeze
  const [frozenCards, setFrozenCards] = useState([]);

  // Track “baru masuk” untuk highlight
  const prevIdsRef = useRef(new Set());
  const [newMap, setNewMap] = useState({}); // { [id]: expireAt }

  // Bila ada data baru, kira mana yang baru
  useEffect(() => {
    const now = Date.now();
    const prev = prevIdsRef.current;
    const next = new Set(cards.map((c) => c.id));

    // Detect new ids
    const newlyAdded = [];
    for (const c of cards) {
      if (!prev.has(c.id)) newlyAdded.push(c.id);
    }

    // Update prev
    prevIdsRef.current = next;

    // Set highlight expire time (12s)
    if (newlyAdded.length > 0) {
      setNewMap((old) => {
        const copy = { ...old };
        newlyAdded.forEach((id) => {
          copy[id] = now + 12000; // 12 saat
        });
        return copy;
      });
    }

    // Cleanup expired highlights
    const t = setTimeout(() => {
      setNewMap((old) => {
        const copy = { ...old };
        Object.keys(copy).forEach((k) => {
          if (copy[k] <= Date.now()) delete copy[k];
        });
        return copy;
      });
    }, 800);

    return () => clearTimeout(t);
  }, [cards]);

  // Freeze logic: bila freeze ON, kunci snapshot
  useEffect(() => {
    if (isFrozen) setFrozenCards(cards);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFrozen, cards]);

  // Fullscreen helper
  async function toggleFullscreen() {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch {
      // ignore
    }
  }

  // AI Cluster (Preview) - call backend
  async function handleAIClusterPreview() {
    try {
      const sid = (sessionId || "").trim();
      if (!sid) throw new Error("Session ID kosong.");

      const res = await fetch(`${API_BASE}/api/cluster/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: sid }),
      });

      if (!res.ok) throw new Error(`Cluster preview gagal (${res.status})`);

      const data = await res.json();
      console.log("AI Cluster Result:", data);

      setClusterResult(data);
      navigate("/cluster", setPath);

      alert("AI clustering berjaya.");
    } catch (err) {
      console.error("AI Cluster Error:", err);
      alert(`Ralat semasa AI clustering: ${err?.message || "Semak Console."}`);
    }
  }

  // Bila user tekan Esc keluar fullscreen, sync state
  useEffect(() => {
    const onFs = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  // Data yang dipaparkan bergantung kepada freeze
  const displayCards = useMemo(() => {
    const src = isFrozen ? frozenCards : cards;
    return sortByTimeAsc(src);
  }, [cards, frozenCards, isFrozen]);

  const rows = useMemo(() => chunk(displayCards, COLUMNS), [displayCards]);

  // Font scale bila fullscreen
  const fontScale = isFullscreen ? 1.2 : 1.0;

  return (
    <div style={{ ...styles.page, fontSize: `${16 * fontScale}px` }}>
      <div style={styles.headerRow}>
        <div>
          <h1 style={styles.title}>Live Board (DACUM Card)</h1>
          <div style={styles.subTitle}>
            Status: <b>{status}</b> | Session: <b>{sessionId}</b>{" "}
            {isFrozen ? (
              <span style={{ ...styles.badgePill, background: "#111", color: "#fff" }}>
                PAUSE
              </span>
            ) : (
              <span style={{ ...styles.badgePill, background: "#e8f5e9" }}>
                LIVE
              </span>
            )}
          </div>
          {error ? <div style={styles.error}>⚠ {error}</div> : null}
        </div>

        <div style={styles.sessionBox}>
          <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 6 }}>
            PFH DIGITAL BOARD
          </div>

          <label style={{ ...styles.label, marginTop: 0 }}>TAJUK NOSS / SESSION</label>
          <input
            style={{ ...styles.input, marginTop: 6 }}
            value={sessionId}
            onChange={(e) => setSessionId(e.target.value)}
            placeholder="dacum-demo"
          />

          <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              style={{
                ...styles.smallBtn,
                ...(isFrozen ? { background: "#111", color: "#fff", border: "1px solid #111" } : null),
              }}
              onClick={() => setIsFrozen((v) => !v)}
              title="Pause/Resume paparan (data masih masuk di backend)"
            >
              {isFrozen ? "Resume" : "Freeze"}
            </button>

            <button
              type="button"
              style={{ ...styles.smallBtn }}
              onClick={handleAIClusterPreview}
              title="Cadangan AI untuk klusterkan aktiviti (preview)"
            >
            <button onClick={handleAIClusterPreview}>
              AI Cluster (Preview)
            </button>

            <button
              type="button"
              style={{
                ...styles.smallBtn,
                ...(isFullscreen ? { background: "#111", color: "#fff", border: "1px solid #111" } : null),
              }}
              onClick={toggleFullscreen}
              title="Fullscreen untuk projektor/TV"
            >
              {isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
            </button>
          </div>

          <div style={styles.tip}>
            Nama panel disembunyikan untuk keselesaan. “Freeze” hanya kunci paparan supaya fasilitator boleh bincang tanpa gangguan.
          </div>
        </div>
      </div>

<div style={styles.card}>
  {displayCards.length === 0 ? (
    <div style={styles.empty}>Belum ada aktiviti. Panel boleh mula hantar.</div>
  ) : (
    <div style={styles.tableWrap}>
      <table style={styles.table}>
        <tbody>
          {rows.map((row, rIdx) => (
            <tr key={rIdx}>
              {Array.from({ length: COLUMNS }).map((_, cIdx) => {
                const item = row[cIdx];
                const isNew = item && newMap[item.id] && newMap[item.id] > Date.now();

                return (
                  <td
                    key={cIdx}
                    style={{
                      ...styles.td,
                      ...(isNew ? styles.tdNew : null),
                    }}
                  >
                    {item ? (
                      <div>
                        <div style={styles.cellText}>{item.activity}</div>
                        <div style={styles.cellMeta}>
                          <span style={styles.timeOnly}>{formatTime(item.time)}</span>
                          {isNew ? <span style={styles.newBadge}>BARU</span> : null}
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
  );
}  

/**
 * CLUSTER VIEW (MVP) — Klustering Aktiviti → CU (Manual by Fasilitator)
 */
function ClusterPage({ clusterResult }) {
  const [sessionId, setSessionId] = useState(() => safeGetLastSession() || "dacum-demo");
  const { cards, status, error } = useCards(sessionId);

  // UI state
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all"); // all | unassigned | assigned
  const [selectedCardId, setSelectedCardId] = useState(null);

  // Cluster state
  const [cus, setCus] = useState([]); // [{id,title,notes}]
  const [assignments, setAssignments] = useState({}); // { [cardId]: cuId }
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  // auto-save session bila berubah
  useEffect(() => {
    if ((sessionId || "").trim()) safeSetLastSession(sessionId);
  }, [sessionId]);

  // ---- localStorage key by session ----
  const storageKey = useMemo(() => {
    const sid = (sessionId || "").trim() || "dacum-demo";
    return `dacum_cluster_${sid}`;
  }, [sessionId]);

  // ---- load saved cluster when session changes ----
  useEffect(() => {
    setErr("");
    setMsg("");
    setSelectedCardId(null);

    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) {
        setCus([]);
        setAssignments({});
        return;
      }
      const parsed = JSON.parse(raw);
      setCus(Array.isArray(parsed?.cus) ? parsed.cus : []);
      setAssignments(parsed?.assignments && typeof parsed.assignments === "object" ? parsed.assignments : {});
    } catch {
      setCus([]);
      setAssignments({});
    }
  }, [storageKey]);

  // ---- autosave ----
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify({ cus, assignments }));
    } catch {
      // ignore
    }
  }, [storageKey, cus, assignments]);

  // ---- helpers ----
  const sortedCards = useMemo(() => sortByTimeAsc(cards), [cards]);

  const assignedCount = useMemo(() => {
    let c = 0;
    for (const card of sortedCards) if (assignments[card.id]) c++;
    return c;
  }, [sortedCards, assignments]);

  const unassignedCount = useMemo(
    () => sortedCards.length - assignedCount,
    [sortedCards.length, assignedCount]
  );

  const filteredCards = useMemo(() => {
    const q = (query || "").trim().toLowerCase();

    return sortedCards.filter((c) => {
      const isAssigned = !!assignments[c.id];
      if (filter === "unassigned" && isAssigned) return false;
      if (filter === "assigned" && !isAssigned) return false;

      if (!q) return true;
      const text = `${c.activity || ""}`.toLowerCase();
      return text.includes(q);
    });
  }, [sortedCards, assignments, query, filter]);

  const cuById = useMemo(() => {
    const map = {};
    for (const cu of cus) map[cu.id] = cu;
    return map;
  }, [cus]);

  const countsByCu = useMemo(() => {
    const map = {};
    for (const cu of cus) map[cu.id] = 0;
    for (const card of sortedCards) {
      const cuId = assignments[card.id];
      if (cuId && map[cuId] !== undefined) map[cuId] += 1;
    }
    return map;
  }, [cus, sortedCards, assignments]);

  const selectedCard = useMemo(() => {
    if (!selectedCardId) return null;
    return sortedCards.find((c) => c.id === selectedCardId) || null;
  }, [sortedCards, selectedCardId]);

  function toast(text) {
    setMsg(text);
    setTimeout(() => setMsg(""), 1500);
  }

  function makeId(prefix) {
    return `${prefix}-${Math.random().toString(16).slice(2)}-${Date.now()}`;
  }

  function createCU() {
    setErr("");
    const id = makeId("cu");
    const next = { id, title: `CU ${cus.length + 1}`, notes: "" };
    setCus((prev) => [...prev, next]);
    toast("✅ CU baru dicipta.");
  }

  function renameCU(cuId, title) {
    setCus((prev) => prev.map((c) => (c.id === cuId ? { ...c, title } : c)));
  }

  function deleteCU(cuId) {
    setCus((prev) => prev.filter((c) => c.id !== cuId));
    setAssignments((prev) => {
      const copy = { ...prev };
      Object.keys(copy).forEach((cardId) => {
        if (copy[cardId] === cuId) delete copy[cardId];
      });
      return copy;
    });
    toast("🗑️ CU dibuang (aktiviti kembali Unassigned).");
  }

  function assignCard(cardId, cuIdOrEmpty) {
    setAssignments((prev) => {
      const copy = { ...prev };
      if (!cuIdOrEmpty) delete copy[cardId];
      else copy[cardId] = cuIdOrEmpty;
      return copy;
    });
  }

  function clearAllClusters() {
    if (!confirm("Reset semua CU & assignment untuk session ini?")) return;
    setCus([]);
    setAssignments({});
    toast("♻️ Reset berjaya.");
  }

  async function exportJSON() {
    setErr("");
    const sid = (sessionId || "").trim() || "dacum-demo";

    const cuList = cus.map((cu) => ({
      id: cu.id,
      title: cu.title,
      notes: cu.notes || "",
      activities: [],
    }));

    const cuIndex = {};
    cuList.forEach((c) => (cuIndex[c.id] = c));

    const unassigned = [];

    for (const card of sortedCards) {
      const cuId = assignments[card.id];
      const item = { id: card.id, time: card.time, activity: card.activity };
      if (cuId && cuIndex[cuId]) cuIndex[cuId].activities.push(item);
      else unassigned.push(item);
    }

    const payload = {
      sessionId: sid,
      exportedAt: new Date().toISOString(),
      totals: {
        totalCards: sortedCards.length,
        assigned: assignedCount,
        unassigned: unassignedCount,
        cuCount: cus.length,
      },
      // optional: AI preview result (kalau ada)
      aiPreview: clusterResult || null,
      cus: cuList,
      unassigned,
    };

    const text = JSON.stringify(payload, null, 2);

    try {
      await navigator.clipboard.writeText(text);
      toast("📋 Export JSON disalin ke clipboard.");
    } catch {
      setErr("Clipboard tidak dibenarkan oleh browser. Cuba manual copy dari popup.");
      window.prompt("Copy JSON ini:", text);
    }
  }

  const ui = {
    row: {
      display: "grid",
      gridTemplateColumns: "1.2fr 1.1fr 0.9fr",
      gap: 12,
      alignItems: "start",
    },
    pill: {
      display: "inline-block",
      padding: "3px 10px",
      borderRadius: 999,
      border: "1px solid #ddd",
      fontSize: 12,
      fontWeight: 800,
      background: "#f7f7f7",
    },
    listItem: (active) => ({
      border: "1px solid #e6e6e6",
      borderRadius: 10,
      padding: 10,
      background: active ? "#f3f6ff" : "#fff",
      cursor: "pointer",
      marginBottom: 8,
    }),
    mini: { fontSize: 12, opacity: 0.75 },
    select: { ...styles.input, marginTop: 8 },
    topBar: {
      display: "flex",
      gap: 10,
      flexWrap: "wrap",
      alignItems: "center",
      marginTop: 10,
    },
    small: { ...styles.smallBtn, width: "auto" },
    danger: {
      ...styles.smallBtn,
      width: "auto",
      border: "1px solid #b00020",
      color: "#b00020",
    },
  };

  return (
    <div style={styles.page}>
      <div style={styles.headerRow}>
        <div style={{ width: "100%" }}>
          <h1 style={styles.title}>Clustering CU (MVP)</h1>

          <div style={styles.subTitle}>
            Status: <b>{status}</b> | Session: <b>{sessionId}</b>
            <span style={{ marginLeft: 10, ...ui.pill }}>
              Total: {sortedCards.length} | Assigned: {assignedCount} | Unassigned:{" "}
              {unassignedCount}
            </span>
          </div>

          {error ? <div style={styles.error}>⚠ {error}</div> : null}
          {err ? <div style={styles.error}>⚠ {err}</div> : null}
          {msg ? <div style={styles.success}>{msg}</div> : null}

{clusterResult && (
  <div style={{ marginTop: 10, ...styles.card, borderStyle: "dashed" }}>
    <div style={{ fontWeight: 900, marginBottom: 6 }}>
      AI Cluster Preview (data mentah)
    </div>
    <div style={{ fontSize: 12, opacity: 0.8 }}>
      Nota: Ini preview sahaja. Fasilitator masih buat keputusan akhir.
    </div>
    <pre style={{ marginTop: 10, fontSize: 12, overflow: "auto" }}>
      {JSON.stringify(clusterResult, null, 2)}
    </pre>
  </div>
)}

          <div style={ui.topBar}>
            <div style={{ minWidth: 240 }}>
              <label style={{ ...styles.label, marginTop: 0 }}>Tukar Session</label>
              <input
                style={{ ...styles.input, marginTop: 6 }}
                value={sessionId}
                onChange={(e) => setSessionId(e.target.value)}
                placeholder="dacum-demo"
              />
            </div>

            <div style={{ minWidth: 260 }}>
              <label style={{ ...styles.label, marginTop: 0 }}>Carian Aktiviti</label>
              <input
                style={{ ...styles.input, marginTop: 6 }}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="contoh: khutbah / jenazah / jadual..."
              />
            </div>

            <div style={{ minWidth: 220 }}>
              <label style={{ ...styles.label, marginTop: 0 }}>Filter</label>
              <select
                style={{ ...styles.input, marginTop: 6 }}
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              >
                <option value="all">Semua</option>
                <option value="unassigned">Belum assign</option>
                <option value="assigned">Sudah assign</option>
              </select>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 22 }}>
              <button type="button" style={ui.small} onClick={createCU}>
                + CU Baru
              </button>
              <button type="button" style={ui.small} onClick={exportJSON}>
                Export JSON (Copy)
              </button>
              <button
                type="button"
                style={ui.danger}
                onClick={clearAllClusters}
                title="Reset CU & assignment untuk session ini"
              >
                Reset
              </button>
            </div>
          </div>

          <div style={styles.tip}>
            Cara guna: (1) Cipta CU → (2) Assign aktiviti kepada CU guna dropdown → (3) Export JSON untuk fasa CPC/CP.
          </div>
        </div>
      </div>

      <div style={ui.row}>
        {/* LEFT: Activity list */}
        <div style={styles.card}>
          <div style={{ fontWeight: 900, marginBottom: 10 }}>
            Aktiviti Mentah ({filteredCards.length})
          </div>

          {filteredCards.length === 0 ? (
            <div style={styles.empty}>Tiada aktiviti untuk filter/carian ini.</div>
          ) : (
            <div>
              {filteredCards.map((c) => {
                const cuId = assignments[c.id] || "";
                const cuTitle = cuId && cuById[cuId] ? cuById[cuId].title : "";
                const active = selectedCardId === c.id;

                return (
                  <div
                    key={c.id}
                    style={ui.listItem(active)}
                    onClick={() => setSelectedCardId(c.id)}
                    title="Klik untuk lihat detail di panel kanan"
                  >
                    <div style={{ fontWeight: 800, fontSize: 13, lineHeight: 1.25 }}>
                      {c.activity}
                    </div>

                    <div
                      style={{
                        display: "flex",
                        gap: 10,
                        alignItems: "center",
                        marginTop: 8,
                        flexWrap: "wrap",
                      }}
                    >
                      <span style={ui.mini}>⏱ {formatTime(c.time)}</span>
                      {cuId ? (
                        <span style={{ ...ui.pill, background: "#e8f5e9" }}>
                          ASSIGNED: {cuTitle || cuId}
                        </span>
                      ) : (
                        <span style={{ ...ui.pill, background: "#fff8c5" }}>UNASSIGNED</span>
                      )}
                    </div>

                    <select
                      style={ui.select}
                      value={cuId}
                      onChange={(e) => assignCard(c.id, e.target.value)}
                    >
                      <option value="">— Unassigned —</option>
                      {cus.map((cu) => (
                        <option key={cu.id} value={cu.id}>
                          {cu.title}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* MIDDLE: CU buckets */}
        <div style={styles.card}>
          <div style={{ fontWeight: 900, marginBottom: 10 }}>Senarai CU ({cus.length})</div>

          {cus.length === 0 ? (
            <div style={styles.empty}>
              Belum ada CU. Klik <b>+ CU Baru</b> untuk mula.
            </div>
          ) : (
            <div>
              {cus.map((cu) => {
                const count = countsByCu[cu.id] || 0;

                return (
                  <div
                    key={cu.id}
                    style={{
                      border: "1px solid #e6e6e6",
                      borderRadius: 12,
                      padding: 12,
                      marginBottom: 10,
                      background: "#fff",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 10,
                        alignItems: "center",
                      }}
                    >
                      <div style={{ fontWeight: 900 }}>
                        {cu.title} <span style={ui.pill}>{count} aktiviti</span>
                      </div>
                      <button type="button" style={ui.danger} onClick={() => deleteCU(cu.id)}>
                        Delete
                      </button>
                    </div>

                    <label style={{ ...styles.label, marginTop: 10 }}>Rename CU</label>
                    <input
                      style={{ ...styles.input, marginTop: 6 }}
                      value={cu.title}
                      onChange={(e) => renameCU(cu.id, e.target.value)}
                      placeholder="Contoh: Pimpin Solat dan Khutbah"
                    />

                    <div style={{ marginTop: 10, ...ui.mini }}>
                      (MVP) Assignment dibuat dari senarai aktiviti (kiri). Versi seterusnya boleh tambah drag & drop.
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* RIGHT: Inspector */}
        <div style={styles.card}>
          <div style={{ fontWeight: 900, marginBottom: 10 }}>Butiran</div>

          {!selectedCard ? (
            <div style={styles.empty}>Klik salah satu aktiviti di sebelah kiri untuk lihat detail.</div>
          ) : (
            <div>
              <div style={{ ...ui.pill, background: "#f7f7f7" }}>ID: {selectedCard.id}</div>

              <div style={{ marginTop: 10, fontWeight: 900, lineHeight: 1.25 }}>
                {selectedCard.activity}
              </div>

              <div style={{ marginTop: 8, ...ui.mini }}>Masa: {formatTime(selectedCard.time)}</div>

              <label style={styles.label}>Assign ke CU</label>
              <select
                style={styles.input}
                value={assignments[selectedCard.id] || ""}
                onChange={(e) => assignCard(selectedCard.id, e.target.value)}
              >
                <option value="">— Unassigned —</option>
                {cus.map((cu) => (
                  <option key={cu.id} value={cu.id}>
                    {cu.title}
                  </option>
                ))}
              </select>

              <button
                type="button"
                style={{ ...styles.button, marginTop: 10 }}
                onClick={() => assignCard(selectedCard.id, "")}
              >
                Unassign Aktiviti Ini
              </button>

              <div style={styles.tip}>Nota: Panel tidak terlibat dalam kluster. Fasilitator yang buat keputusan.</div>
            </div>
          )}
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
    if (window.location.pathname === "/") navigate("/panel", setPath);
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

  // simpan result AI supaya /cluster boleh baca
  const [clusterResult, setClusterResult] = useState(null);

  // simple guards
  const clean = (path || "/").replace(/\/+$/, "") || "/";

  return (
    <>
      {clean === "/" ? <Home setPath={setPath} /> : null}
      {clean === "/panel" ? <PanelPage /> : null}
      {clean === "/board" ? (
        <BoardPage setPath={setPath} setClusterResult={setClusterResult} />
      ) : null}
      {clean === "/cluster" ? <ClusterPage clusterResult={clusterResult} /> : null}

      {clean !== "/" && clean !== "/panel" && clean !== "/board" && clean !== "/cluster" ? (
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
              <button style={styles.button} onClick={() => navigate("/cluster", setPath)}>
                Pergi ke /cluster
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
    background: "#fff",
  },

  smallBtn: {
    padding: "8px 10px",
    borderRadius: 10,
    border: "1px solid #ddd",
    background: "#fff",
    cursor: "pointer",
    fontWeight: 800,
    fontSize: 12,
  },

  badgePill: {
    display: "inline-block",
    padding: "2px 10px",
    borderRadius: 999,
    border: "1px solid #ddd",
    fontSize: 11,
    fontWeight: 900,
    marginLeft: 8,
  },

  tdNew: {
    background: "#fff8c5", // highlight kuning lembut (aktiviti baru)
  },

  newBadge: {
    display: "inline-block",
    padding: "1px 6px",
    borderRadius: 999,
    border: "1px solid #ddd",
    fontSize: 10,
    fontWeight: 900,
    background: "#111",
    color: "#fff",
  },
  error: { marginTop: 10, color: "#b00020", fontSize: 13 },
  success: { marginTop: 10, color: "#0a7a2f", fontSize: 13, fontWeight: 700 },
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
};

createRoot(document.getElementById("root")).render(<App />);
