import React, { useEffect, useMemo, useState } from "react";

const API_BASE =
  (import.meta?.env?.VITE_API_BASE && String(import.meta.env.VITE_API_BASE)) ||
  "https://dacum-backend.onrender.com";

function getQueryParam(name) {
  // 1) normal query: ?session=...
  const s = new URLSearchParams(window.location.search);
  const v1 = s.get(name);
  if (v1) return v1;

  // 2) hash query: #/cocu-editor?session=...&cu=...
  const h = window.location.hash || "";
  const qIndex = h.indexOf("?");
  if (qIndex === -1) return "";
  const qs = h.slice(qIndex + 1);
  const hParams = new URLSearchParams(qs);
  return hParams.get(name) || "";
}

function safeStr(x) {
  return String(x ?? "").trim();
}

function extractCuList(cpc) {
  if (!cpc) return [];
  if (Array.isArray(cpc.cus)) return cpc.cus;
  if (Array.isArray(cpc.units)) return cpc.units;
  if (Array.isArray(cpc.competencyUnits)) return cpc.competencyUnits;

  if (cpc.data) {
    if (Array.isArray(cpc.data.cus)) return cpc.data.cus;
    if (Array.isArray(cpc.data.units)) return cpc.data.units;
    if (Array.isArray(cpc.data.competencyUnits)) return cpc.data.competencyUnits;
  }

  const terases =
    cpc.terases || cpc.terasList || cpc.teras || cpc.data?.terases || [];
  const out = [];
  for (const t of terases) {
    const cuList = t.cus || t.cuList || t.units || t.competencyUnits || [];
    for (const cu of cuList) out.push(cu);
  }
  return out;
}

function getCuCodeCanonical(cu) {
  return safeStr(cu?.cuCode || cu?.cuId || cu?.id || cu?.code).toLowerCase();
}
function getCuTitle(cu) {
  return safeStr(cu?.cuTitle || cu?.title || cu?.name || cu?.cuName);
}

function extractWaListFromCu(cu) {
  return cu?.wa || cu?.waList || cu?.workActivities || cu?.activities || cu?.was || [];
}
function getWaIdCanonical(wa) {
  return safeStr(wa?.waCode || wa?.waId || wa?.id || wa?.code).toLowerCase();
}
function getWaTitle(wa) {
  return safeStr(wa?.waTitle || wa?.title || wa?.name || wa?.text);
}

function pad2(n) {
  const x = Number(n) || 0;
  return String(x).padStart(2, "0");
}

function normalizeDraftForEditor(draft, cuFromCpc) {
  // target: { waItems:[{waCode, waTitle, knowledge, skills, attitude, criteria}] }
  const waFromCpc = extractWaListFromCu(cuFromCpc) || [];

  const base = waFromCpc.map((wa, wi) => ({
    waCode: getWaIdCanonical(wa) || `w${pad2(wi + 1)}`,
    waTitle: getWaTitle(wa) || `WA ${wi + 1}`,
    knowledge: "",
    skills: "",
    attitude: "",
    criteria: "",
  }));

  if (!draft?.waItems?.length) return { waItems: base };

  // merge ikut waCode (kalau match)
  const map = new Map();
  for (const b of base) map.set(String(b.waCode).toLowerCase(), { ...b });

  for (const w of draft.waItems) {
    const key = safeStr(w?.waCode).toLowerCase();
    if (!key) continue;
    const prev = map.get(key) || {
      waCode: key,
      waTitle: safeStr(w?.waTitle) || "",
      knowledge: "",
      skills: "",
      attitude: "",
      criteria: "",
    };
    map.set(key, {
      ...prev,
      waTitle: prev.waTitle || safeStr(w?.waTitle) || "",
      knowledge: safeStr(w?.knowledge),
      skills: safeStr(w?.skills),
      attitude: safeStr(w?.attitude),
      criteria: safeStr(w?.criteria),
    });
  }

  return { waItems: Array.from(map.values()) };
}

export default function CoCUEditor() {
  const sessionId = getQueryParam("session");
  const cuCodeCanon = safeStr(getQueryParam("cu")).toLowerCase();

  const [cpc, setCpc] = useState(null);
  const [cu, setCu] = useState(null);
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [model, setModel] = useState({ waItems: [] });

  const storageKey = useMemo(() => {
    if (!sessionId || !cuCodeCanon) return "";
    return `cocuDraft:${sessionId}:${cuCodeCanon}`;
  }, [sessionId, cuCodeCanon]);

  function backToDashboard() {
    const sid = encodeURIComponent(safeStr(sessionId));
    window.location.hash = `#/cocu-dashboard?session=${sid}`;
  }

  async function loadCpcAndCu() {
    if (!sessionId) return;
    if (!cuCodeCanon) return;

    setLoading(true);
    setErr("");
    setInfo("");
    try {
      const r = await fetch(`${API_BASE}/api/cpc/${encodeURIComponent(sessionId)}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "Gagal load CPC");
      setCpc(j);

      const cuArr = extractCuList(j);
      const found = (cuArr || []).find((x) => getCuCodeCanonical(x) === cuCodeCanon);
      if (!found) throw new Error(`CU '${cuCodeCanon}' tidak ditemui dalam CPC.`);

      setCu(found);

      // load draft local jika ada
      let draft = null;
      try {
        const raw = storageKey ? sessionStorage.getItem(storageKey) : null;
        if (raw) draft = JSON.parse(raw);
      } catch (e) {}

      const normalized = normalizeDraftForEditor(draft, found);
      setModel(normalized);
    } catch (e) {
      setErr(String(e?.message || e));
      setCpc(null);
      setCu(null);
      setModel({ waItems: [] });
    } finally {
      setLoading(false);
    }
  }

  // initial load
  useEffect(() => {
    if (!sessionId) return;
    if (!cuCodeCanon) return;
    loadCpcAndCu();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, cuCodeCanon]);

  // autosave local setiap perubahan (debounced ringkas)
  useEffect(() => {
    if (!storageKey) return;
    const t = setTimeout(() => {
      try {
        const payload = {
          sessionId,
          cuCode: cuCodeCanon,
          cuTitle: getCuTitle(cu),
          waItems: model.waItems || [],
          generatedAt: new Date().toISOString(),
          source: "editor",
        };
        sessionStorage.setItem(storageKey, JSON.stringify(payload));
        setInfo("Auto-saved (local).");
      } catch (e) {}
    }, 450);

    return () => clearTimeout(t);
  }, [model, storageKey, sessionId, cuCodeCanon, cu]);

  function updateField(waCode, field, value) {
    const key = safeStr(waCode).toLowerCase();
    setModel((prev) => {
      const items = (prev.waItems || []).map((w) => {
        if (safeStr(w.waCode).toLowerCase() !== key) return w;
        return { ...w, [field]: value };
      });
      return { ...prev, waItems: items };
    });
  }

  function saveLocalNow() {
    if (!storageKey) return;
    try {
      const payload = {
        sessionId,
        cuCode: cuCodeCanon,
        cuTitle: getCuTitle(cu),
        waItems: model.waItems || [],
        generatedAt: new Date().toISOString(),
        source: "editor",
      };
      sessionStorage.setItem(storageKey, JSON.stringify(payload));
      setInfo("Draft disimpan (local).");
      setErr("");
    } catch (e) {
      setErr("Gagal simpan local.");
    }
  }

  /**
   * Optional server save:
   * POST /api/cocu/save
   * body: { sessionId, cuCode, cuTitle, waItems:[...] }
   */
  async function saveToServer() {
    if (!sessionId || !cuCodeCanon) return;
    setSaving(true);
    setErr("");
    setInfo("");

    try {
      const payload = {
        sessionId,
        cuCode: cuCodeCanon,
        cuTitle: getCuTitle(cu),
        waItems: model.waItems || [],
      };

      const r = await fetch(`${API_BASE}/api/cocu/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        throw new Error(
          j?.error ||
            "Gagal simpan ke server. Pastikan backend ada endpoint POST /api/cocu/save."
        );
      }

      setInfo("Berjaya simpan ke server ✅");
      // juga simpan local sebagai backup
      saveLocalNow();
    } catch (e) {
      setErr(String(e?.message || e));
    } finally {
      setSaving(false);
    }
  }

  const cuTitle = getCuTitle(cu);
  const waItems = model.waItems || [];

  return (
    <div style={{ padding: 16, maxWidth: 1200, margin: "0 auto" }}>
      <h2 style={{ margin: "8px 0 12px" }}>CoCU Editor</h2>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <button onClick={backToDashboard}>← Back to CoCU Dashboard</button>
        <button onClick={() => window.print()} disabled={!sessionId}>
          Print
        </button>
        <button onClick={saveLocalNow} disabled={!sessionId || !cuCodeCanon}>
          Save Draft (Local)
        </button>
        <button onClick={saveToServer} disabled={saving || !sessionId || !cuCodeCanon}>
          {saving ? "Saving..." : "Save to Server"}
        </button>
      </div>

      <div style={{ marginBottom: 10, fontSize: 14 }}>
        <div>
          <b>Session:</b> {sessionId || "(tiada)"}
        </div>
        <div>
          <b>CU:</b> {cuCodeCanon ? cuCodeCanon.toUpperCase() : "(tiada)"}{" "}
          {cuTitle ? `— ${cuTitle}` : ""}
        </div>
      </div>

      {!sessionId && (
        <div style={{ background: "#fff3cd", padding: 10, borderRadius: 8 }}>
          Sila buka dengan URL:
          <div style={{ marginTop: 6, fontFamily: "monospace" }}>
            {`/#/cocu-editor?session=Office-v3&cu=c01`}
          </div>
        </div>
      )}

      {info && (
        <div style={{ background: "#e8f5e9", padding: 10, borderRadius: 8, marginTop: 10 }}>
          {info}
        </div>
      )}

      {err && (
        <div style={{ background: "#fde2e2", padding: 10, borderRadius: 8, marginTop: 10 }}>
          <b>Error:</b> {err}
        </div>
      )}

      {loading && <div style={{ marginTop: 12 }}>Loading CPC & CoCU...</div>}

      {!loading && cu && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 13, marginBottom: 6 }}>
            <b>{cuCodeCanon.toUpperCase()}</b>: <span>Ambil dari CU (tidak boleh diubah)</span>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 13,
                minWidth: 980,
                background: "#fff",
              }}
            >
              <thead>
                <tr>
                  <th style={th}>AKTIVITI KERJA</th>
                  <th style={th}>PENGETAHUAN BERKAITAN</th>
                  <th style={th}>KEMAHIRAN BERKAITAN</th>
                  <th style={th}>SIKAP/ KESELAMATAN/ PERSEKITARAN</th>
                  <th style={th}>KRITERIA PENILAIAN</th>
                </tr>
              </thead>

              <tbody>
                {waItems.map((w, wi) => {
                  const no = wi + 1;
                  const waTitleLocked = safeStr(w?.waTitle);
                  const waCodeLocked = safeStr(w?.waCode);
                  const idxTag = `${no}.1`;

                  return (
                    <tr key={(waCodeLocked || `wa-${no}`) + "-" + no}>
                      <td style={td}>
                        <div style={{ fontWeight: 700 }}>
                          {no}. {waTitleLocked || "(tiada tajuk WA)"}
                        </div>
                        <div style={{ fontSize: 12, marginTop: 6, color: "#b10000" }}>
                          Ambil dari WA (tidak boleh diubah)
                        </div>
                        {waCodeLocked && (
                          <div style={{ fontSize: 12, marginTop: 6 }}>
                            <b>WA Code:</b> <code>{waCodeLocked}</code>
                          </div>
                        )}
                      </td>

                      <td style={td}>
                        <textarea
                          value={w.knowledge || ""}
                          onChange={(e) => updateField(waCodeLocked, "knowledge", e.target.value)}
                          placeholder={idxTag}
                          style={ta}
                        />
                      </td>

                      <td style={td}>
                        <textarea
                          value={w.skills || ""}
                          onChange={(e) => updateField(waCodeLocked, "skills", e.target.value)}
                          placeholder={idxTag}
                          style={ta}
                        />
                      </td>

                      <td style={td}>
                        <textarea
                          value={w.attitude || ""}
                          onChange={(e) => updateField(waCodeLocked, "attitude", e.target.value)}
                          placeholder={idxTag}
                          style={ta}
                        />
                      </td>

                      <td style={td}>
                        <textarea
                          value={w.criteria || ""}
                          onChange={(e) => updateField(waCodeLocked, "criteria", e.target.value)}
                          placeholder={idxTag}
                          style={ta}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div style={{ marginTop: 8, fontSize: 12, color: "#555" }}>
              <i>
                Nota: Aktiviti Kerja (WA) & CU dikunci ikut CPC. Kolum lain disimpan sebagai draft dan boleh dihantar ke
                server.
              </i>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const th = {
  border: "1px solid #000",
  padding: "10px 8px",
  background: "#e9e9e9",
  textAlign: "center",
  verticalAlign: "middle",
};
const td = {
  border: "1px solid #000",
  padding: "10px 8px",
  verticalAlign: "top",
};
const ta = {
  width: "100%",
  minHeight: 120,
  resize: "vertical",
  padding: 8,
  borderRadius: 8,
  border: "1px solid #bbb",
  fontFamily: "inherit",
  fontSize: 13,
  lineHeight: 1.35,
  boxSizing: "border-box",
};
