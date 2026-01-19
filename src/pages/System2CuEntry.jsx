import React, { useEffect, useMemo, useState } from "react";

// Local draft key (per session)
function draftKey(sessionId) {
  return `inoss:s2:cu-entry:draft:${sessionId || "default"}`;
}

function safeJsonParse(s, fallback) {
  try {
    return JSON.parse(s);
  } catch {
    return fallback;
  }
}

function slugId() {
  return `cu_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function nextCuCode(existing) {
  // existing: array of { cuCode: "C01" }
  const nums = existing
    .map((x) => String(x.cuCode || "").trim())
    .map((c) => {
      const m = c.match(/^C(\d{1,3})$/i);
      return m ? Number(m[1]) : null;
    })
    .filter((n) => Number.isFinite(n));

  const max = nums.length ? Math.max(...nums) : 0;
  const next = max + 1;
  return `C${String(next).padStart(2, "0")}`;
}

function nextWaCode(cuCode, activities) {
  // activities: [{ waCode: "C01-W01" }]
  const nums = activities
    .map((a) => String(a.waCode || "").trim())
    .map((w) => {
      const m = w.match(/-W(\d{1,3})$/i);
      return m ? Number(m[1]) : null;
    })
    .filter((n) => Number.isFinite(n));

  const max = nums.length ? Math.max(...nums) : 0;
  const next = max + 1;
  return `${cuCode}-W${String(next).padStart(2, "0")}`;
}

export default function System2CuEntry() {
  // Header meta
  const [meta, setMeta] = useState({
    nossTitle: "",
    nossCodeBase: "0841-XXX-4:2021", // boleh ubah
    level: "4",
    sessionId: "Masjid",
  });

  // CU list
  const [cus, setCus] = useState([]);

  const storageKey = useMemo(() => draftKey(meta.sessionId), [meta.sessionId]);

  // Load draft on first mount / when sessionId changes
  useEffect(() => {
    const raw = localStorage.getItem(storageKey);
    if (!raw) {
      setCus([]);
      return;
    }
    const parsed = safeJsonParse(raw, null);
    if (parsed?.cus && Array.isArray(parsed.cus)) {
      setMeta((m) => ({ ...m, ...(parsed.meta || {}) }));
      setCus(parsed.cus);
    } else {
      setCus([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  function saveDraft() {
    const payload = {
      savedAt: new Date().toISOString(),
      meta,
      cus,
    };
    localStorage.setItem(storageKey, JSON.stringify(payload));
    alert("Draf disimpan (local).");
  }

  function addCu() {
    setCus((prev) => {
      const cuCode = nextCuCode(prev);
      return [
        ...prev,
        {
          id: slugId(),
          cuTitle: "",
          cuCode,
          activities: [
            {
              id: slugId(),
              waTitle: "",
              waCode: `${cuCode}-W01`,
            },
          ],
        },
      ];
    });
  }

  function removeCu(cuId) {
    setCus((prev) => prev.filter((c) => c.id !== cuId));
  }

  function updateCu(cuId, patch) {
    setCus((prev) =>
      prev.map((c) => (c.id === cuId ? { ...c, ...patch } : c))
    );
  }

  function addActivity(cuId) {
    setCus((prev) =>
      prev.map((c) => {
        if (c.id !== cuId) return c;
        const cuCode = c.cuCode || "C01";
        const waCode = nextWaCode(cuCode, c.activities || []);
        return {
          ...c,
          activities: [
            ...(c.activities || []),
            { id: slugId(), waTitle: "", waCode },
          ],
        };
      })
    );
  }

  function removeActivity(cuId, actId) {
    setCus((prev) =>
      prev.map((c) => {
        if (c.id !== cuId) return c;
        return {
          ...c,
          activities: (c.activities || []).filter((a) => a.id !== actId),
        };
      })
    );
  }

  function updateActivity(cuId, actId, patch) {
    setCus((prev) =>
      prev.map((c) => {
        if (c.id !== cuId) return c;
        return {
          ...c,
          activities: (c.activities || []).map((a) =>
            a.id === actId ? { ...a, ...patch } : a
          ),
        };
      })
    );
  }

function goNext() {
  // Basic validation minimal
  if (!cus.length) {
    alert("Tiada CU. Sila tambah sekurang-kurangnya 1 CU.");
    return;
  }

  const hasEmpty = cus.some(
    (c) =>
      !String(c.cuTitle || "").trim() ||
      (c.activities || []).some((a) => !String(a.waTitle || "").trim())
  );

  if (hasEmpty) {
    alert("Sila lengkapkan Nama CU dan Nama Aktiviti sebelum teruskan.");
    return;
  }

  // Simpan draf dahulu (sync) kemudian navigate ke Page 2.2
  saveDraft();

  const sid = meta.sessionId || "Masjid";
  window.location.hash = `#/s2/compare?session=${encodeURIComponent(sid)}`;
}

// ✅ Pastikan ini berada DI LUAR goNext() (level component)
const totalActivities = useMemo(
  () => cus.reduce((sum, c) => sum + (c.activities?.length || 0), 0),
  [cus]
);

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <h1 style={{ marginTop: 0 }}>Sistem 2 — CU Manual Entry (Page 2.1)</h1>
      <p style={{ marginTop: 6, color: "#444" }}>
        Masukkan <b>CU muktamad</b> &amp; senarai aktiviti seperti hasil Sistem 1.
        (Tiada AI di page ini)
      </p>

      {/* Header meta */}
      <div
        style={{
          border: "1px solid #ddd",
          borderRadius: 12,
          padding: 16,
          marginTop: 16,
        }}
      >
        <h3 style={{ margin: 0 }}>Maklumat NOSS / Sesi</h3>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 12,
            marginTop: 12,
          }}
        >
          <label>
            Tajuk NOSS
            <input
              value={meta.nossTitle}
              onChange={(e) =>
                setMeta((m) => ({ ...m, nossTitle: e.target.value }))
              }
              placeholder="Contoh: Pentadbiran & Pengimarahan Masjid"
              style={{ width: "100%", padding: 10, marginTop: 6 }}
            />
          </label>

          <label>
            Kod NOSS (Base)
            <input
              value={meta.nossCodeBase}
              onChange={(e) =>
                setMeta((m) => ({ ...m, nossCodeBase: e.target.value }))
              }
              placeholder="0841-XXX-4:2021"
              style={{ width: "100%", padding: 10, marginTop: 6 }}
            />
          </label>

          <label>
            Tahap
            <input
              value={meta.level}
              onChange={(e) => setMeta((m) => ({ ...m, level: e.target.value }))}
              placeholder="4"
              style={{ width: "100%", padding: 10, marginTop: 6 }}
            />
          </label>

          <label>
            Session ID
            <input
              value={meta.sessionId}
              onChange={(e) =>
                setMeta((m) => ({ ...m, sessionId: e.target.value }))
              }
              placeholder="Masjid"
              style={{ width: "100%", padding: 10, marginTop: 6 }}
            />
          </label>
        </div>

        <div style={{ marginTop: 12, color: "#333" }}>
          <b>Ringkasan:</b> {cus.length} CU • {totalActivities} aktiviti
        </div>
      </div>

      {/* CU blocks */}
      <div style={{ marginTop: 18 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <h2 style={{ margin: 0 }}>Senarai CU</h2>
          <button onClick={addCu} style={{ padding: "10px 14px" }}>
            + Tambah CU
          </button>
        </div>

        {cus.length === 0 && (
          <div
            style={{
              marginTop: 12,
              padding: 14,
              border: "1px dashed #bbb",
              borderRadius: 12,
              color: "#444",
            }}
          >
            Tiada CU lagi. Klik <b>+ Tambah CU</b> untuk mula.
          </div>
        )}

        {cus.map((cu, idx) => {
          const fullCuCode = `${meta.nossCodeBase}-${cu.cuCode}`;
          return (
            <div
              key={cu.id}
              style={{
                border: "1px solid #ddd",
                borderRadius: 12,
                padding: 16,
                marginTop: 14,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  alignItems: "flex-start",
                }}
              >
                <div>
                  <h3 style={{ margin: 0 }}>
                    CU {idx + 1}:{" "}
                    <span style={{ color: "#333" }}>{cu.cuCode}</span>
                  </h3>
                  <div style={{ marginTop: 6, color: "#444" }}>
                    Kod Penuh: <b>{fullCuCode}</b>
                  </div>
                </div>

                <button
                  onClick={() => removeCu(cu.id)}
                  style={{
                    padding: "8px 12px",
                    border: "1px solid #d66",
                    background: "white",
                    borderRadius: 10,
                    color: "#a11",
                  }}
                >
                  Delete CU
                </button>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "2fr 1fr",
                  gap: 12,
                  marginTop: 12,
                }}
              >
                <label>
                  Nama CU
                  <input
                    value={cu.cuTitle}
                    onChange={(e) =>
                      updateCu(cu.id, { cuTitle: e.target.value })
                    }
                    placeholder="Contoh: Pimpinan Solat dan Khutbah"
                    style={{ width: "100%", padding: 10, marginTop: 6 }}
                  />
                </label>

                <label>
                  Kod CU (C01, C02…)
                  <input
                    value={cu.cuCode}
                    onChange={(e) =>
                      updateCu(cu.id, {
                        cuCode: e.target.value.toUpperCase(),
                      })
                    }
                    style={{ width: "100%", padding: 10, marginTop: 6 }}
                  />
                </label>
              </div>

              {/* Activities */}
              <div style={{ marginTop: 14 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <h4 style={{ margin: 0 }}>Senarai Aktiviti (WA)</h4>
                  <button
                    onClick={() => addActivity(cu.id)}
                    style={{ padding: "8px 12px" }}
                  >
                    + Tambah Aktiviti
                  </button>
                </div>

                <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                  {(cu.activities || []).map((a, aidx) => (
                    <div
                      key={a.id}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "40px 2fr 1fr 110px",
                        gap: 10,
                        alignItems: "center",
                      }}
                    >
                      <div style={{ textAlign: "right", color: "#444" }}>
                        {aidx + 1}.
                      </div>

                      <input
                        value={a.waTitle}
                        onChange={(e) =>
                          updateActivity(cu.id, a.id, {
                            waTitle: e.target.value,
                          })
                        }
                        placeholder="Nama Aktiviti (contoh: Imamkan solat fardu)"
                        style={{ padding: 10 }}
                      />

                      <input
                        value={a.waCode}
                        onChange={(e) =>
                          updateActivity(cu.id, a.id, {
                            waCode: e.target.value.toUpperCase(),
                          })
                        }
                        placeholder={`${cu.cuCode}-W01`}
                        style={{ padding: 10 }}
                      />

                      <button
                        onClick={() => removeActivity(cu.id, a.id)}
                        style={{
                          padding: "8px 10px",
                          border: "1px solid #d66",
                          background: "white",
                          borderRadius: 10,
                          color: "#a11",
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  ))}
                </div>

                <div style={{ marginTop: 8, color: "#666", fontSize: 13 }}>
                  Nota: Aktiviti adalah hasil muktamad Sistem 1. (Sistem 2 akan
                  buat perbandingan MySPIKE selepas anda sahkan.)
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer actions */}
      <div
        style={{
          display: "flex",
          gap: 10,
          justifyContent: "flex-end",
          marginTop: 18,
          paddingTop: 14,
          borderTop: "1px solid #eee",
        }}
      >
        <button onClick={saveDraft} style={{ padding: "10px 14px" }}>
          Simpan Draf
        </button>
        <button
          onClick={goNext}
          style={{
            padding: "10px 14px",
            border: "1px solid #111",
            background: "#111",
            color: "white",
            borderRadius: 12,
          }}
        >
          Sahkan & Teruskan (MySPIKE Compare)
        </button>
      </div>
    </div>
  );
}
