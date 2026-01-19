import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

const API_BASE =
  (import.meta?.env?.VITE_API_BASE && String(import.meta.env.VITE_API_BASE)) ||
  "https://dacum-backend.onrender.com";

function uid(prefix = "tmp") {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export default function System2CuEntry() {
  const nav = useNavigate();

  const [sessionId, setSessionId] = useState("Masjid");
  const [cus, setCus] = useState([
    { cuId: uid("cu"), cuTitle: "", activities: [{ waId: uid("wa"), waTitle: "" }] },
  ]);

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const totalWA = useMemo(() => {
    return cus.reduce((sum, c) => sum + (c.activities?.length || 0), 0);
  }, [cus]);

  function addCU() {
    setCus((prev) => [
      ...prev,
      { cuId: uid("cu"), cuTitle: "", activities: [{ waId: uid("wa"), waTitle: "" }] },
    ]);
  }

  function removeCU(cuId) {
    setCus((prev) => prev.filter((c) => c.cuId !== cuId));
  }

  function updateCUTitle(cuId, value) {
    setCus((prev) =>
      prev.map((c) => (c.cuId === cuId ? { ...c, cuTitle: value } : c))
    );
  }

  function addWA(cuId) {
    setCus((prev) =>
      prev.map((c) =>
        c.cuId === cuId
          ? { ...c, activities: [...(c.activities || []), { waId: uid("wa"), waTitle: "" }] }
          : c
      )
    );
  }

  function removeWA(cuId, waId) {
    setCus((prev) =>
      prev.map((c) =>
        c.cuId === cuId
          ? { ...c, activities: (c.activities || []).filter((a) => a.waId !== waId) }
          : c
      )
    );
  }

  function updateWATitle(cuId, waId, value) {
    setCus((prev) =>
      prev.map((c) =>
        c.cuId === cuId
          ? {
              ...c,
              activities: (c.activities || []).map((a) =>
                a.waId === waId ? { ...a, waTitle: value } : a
              ),
            }
          : c
      )
    );
  }

  function buildSeedPayload() {
    const sid = String(sessionId || "").trim();
    const waList = [];

    for (const c of cus) {
      const cuTitle = String(c.cuTitle || "").trim();
      for (const a of c.activities || []) {
        const waTitle = String(a.waTitle || "").trim();
        if (waTitle) {
          waList.push({ cuTitle, waTitle });
        }
      }
    }

    return { sid, waList };
  }

  async function seedWA() {
    setErr("");
    setMsg("");

    const { sid, waList } = buildSeedPayload();

    if (!sid) {
      setErr("Session ID kosong. Sila isi Session ID.");
      return;
    }
    if (!waList.length) {
      setErr("Tiada WA. Sila isi sekurang-kurangnya 1 WA sebenar.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/s2/seed-wa`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: sid, waList }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok || json?.ok === false) {
        throw new Error(json?.error || `Seed gagal (HTTP ${res.status})`);
      }

      setMsg(`Seed berjaya: ${json?.total ?? waList.length} WA disimpan dalam session "${sid}".`);

      // terus ke compare
      nav(`/system2/compare?sessionId=${encodeURIComponent(sid)}`);
    } catch (e) {
      setErr(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: 16, maxWidth: 1100, margin: "0 auto" }}>
      <h2 style={{ margin: "0 0 6px" }}>Sistem 2 — Page 2.1 (CU + WA Sebenar)</h2>
      <div style={{ opacity: 0.8, marginBottom: 12 }}>
        Isi CU & WA sebenar (DACUM). Lepas itu “Seed WA” untuk dihantar ke server.
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12 }}>
        <label style={{ minWidth: 110 }}>Session ID</label>
        <input
          value={sessionId}
          onChange={(e) => setSessionId(e.target.value)}
          placeholder="Contoh: Masjid"
          style={{ padding: 8, width: 260 }}
        />
        <div style={{ marginLeft: "auto", opacity: 0.8 }}>
          Jumlah WA: <b>{totalWA}</b>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
        <button onClick={addCU} disabled={loading} style={{ padding: "8px 12px" }}>
          + Tambah CU
        </button>
        <button onClick={seedWA} disabled={loading} style={{ padding: "8px 12px" }}>
          {loading ? "Seeding..." : "Save & Seed WA → Compare"}
        </button>
      </div>

      {msg ? (
        <div style={{ padding: 10, background: "#eef8ee", border: "1px solid #bfe6bf", marginBottom: 10 }}>
          {msg}
        </div>
      ) : null}
      {err ? (
        <div style={{ padding: 10, background: "#ffecec", border: "1px solid #ffb4b4", marginBottom: 10 }}>
          {err}
        </div>
      ) : null}

      {cus.map((c, idx) => (
        <div key={c.cuId} style={{ border: "1px solid #ddd", borderRadius: 10, padding: 12, marginBottom: 12 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10 }}>
            <div style={{ fontWeight: 700 }}>CU #{idx + 1}</div>
            <input
              value={c.cuTitle}
              onChange={(e) => updateCUTitle(c.cuId, e.target.value)}
              placeholder="Contoh: C01 Pimpin Solat dan Khutbah"
              style={{ padding: 8, flex: 1 }}
            />
            <button onClick={() => addWA(c.cuId)} disabled={loading} style={{ padding: "6px 10px" }}>
              + WA
            </button>
            <button
              onClick={() => removeCU(c.cuId)}
              disabled={loading || cus.length === 1}
              style={{ padding: "6px 10px" }}
              title={cus.length === 1 ? "Sekurang-kurangnya perlu 1 CU" : "Buang CU"}
            >
              Buang CU
            </button>
          </div>

          {(c.activities || []).map((a, j) => (
            <div key={a.waId} style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 8 }}>
              <div style={{ width: 52, opacity: 0.7 }}>WA {j + 1}</div>
              <input
                value={a.waTitle}
                onChange={(e) => updateWATitle(c.cuId, a.waId, e.target.value)}
                placeholder="Contoh: Imamkan solat fardu"
                style={{ padding: 8, flex: 1 }}
              />
              <button
                onClick={() => removeWA(c.cuId, a.waId)}
                disabled={loading || (c.activities || []).length === 1}
                style={{ padding: "6px 10px" }}
              >
                Buang
              </button>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
