import React, { useMemo, useState } from "react";

/**
 * WIMPage (Template CIDB/JPK)
 * Struktur: TAJUK → OBJEKTIF → PENERANGAN → RUJUKAN → LATIHAN → SKEMA
 */

// util: roman numerals (i, ii, iii...)
function toRoman(num) {
  const map = [
    ["m", 1000],
    ["cm", 900],
    ["d", 500],
    ["cd", 400],
    ["c", 100],
    ["xc", 90],
    ["l", 50],
    ["xl", 40],
    ["x", 10],
    ["ix", 9],
    ["v", 5],
    ["iv", 4],
    ["i", 1],
  ];
  let n = num;
  let out = "";
  for (const [sym, val] of map) {
    while (n >= val) {
      out += sym;
      n -= val;
    }
  }
  return out || "i";
}

const DEFAULT_INSTRUCTION =
  'Peserta dikehendaki menjawab semua soalan dengan merujuk kepada Pakej Latihan.\n' +
  "a) Kertas soalan ini mengandungi soalan pemahaman ringkas.\n" +
  "b) Masa yang dibenarkan 15 minit.\n" +
  "Arahan: Jawab semua soalan.";

export default function WIMPage() {
  // LEFT PANEL
  const [nossCode, setNossCode] = useState("");
  const [nossTitle, setNossTitle] = useState("");
  const [level, setLevel] = useState("");
  const [paketLatihan, setPaketLatihan] = useState("");
  const [audienceLevel, setAudienceLevel] = useState("asas");
  const [files, setFiles] = useState([]);

  // TEMPLATE DATA
  const [tajuk, setTajuk] = useState("");
  const [objektif, setObjektif] = useState("");

  const [penerangan, setPenerangan] = useState([
    {
      titleMain: "", // "1) TAJUK ISI KANDUNGAN"
      kandunganText: "", // ringkasan kandungan
      subtajuk: [
        {
          title: "", // "a) Sub Tajuk"
          pecahan: [
            {
              title: "", // "i) Pecahan Sub Tajuk"
              bullets: [""], // "• Perincian Sub Tajuk"
            },
          ],
        },
      ],
    },
  ]);

  const [rujukan, setRujukan] = useState([
    { text: "" }, // "1. Contoh: ..."
  ]);

  const [latihan, setLatihan] = useState({
    instructionText: DEFAULT_INSTRUCTION,
    questions: [{ qText: "", expectedPoints: 0 }],
  });

  const [skema, setSkema] = useState([
    { answerBullets: [""] }, // auto link by index (0..n-1)
  ]);

  // UI helpers
  const peneranganPreviewLabels = useMemo(() => {
    return penerangan.map((block, idx) => ({
      blockNo: idx + 1,
      kandunganNo: `${idx + 1}.1`,
    }));
  }, [penerangan]);

  // ----- Handlers (PENERANGAN) -----
  const addPeneranganBlock = () => {
    setPenerangan((prev) => [
      ...prev,
      {
        titleMain: "",
        kandunganText: "",
        subtajuk: [
          { title: "", pecahan: [{ title: "", bullets: [""] }] },
        ],
      },
    ]);
  };

  const removePeneranganBlock = (idx) => {
    setPenerangan((prev) => prev.filter((_, i) => i !== idx));
  };

  const updatePeneranganBlock = (idx, patch) => {
    setPenerangan((prev) =>
      prev.map((b, i) => (i === idx ? { ...b, ...patch } : b))
    );
  };

  const addSubtajuk = (blockIdx) => {
    setPenerangan((prev) =>
      prev.map((b, i) => {
        if (i !== blockIdx) return b;
        return {
          ...b,
          subtajuk: [
            ...b.subtajuk,
            { title: "", pecahan: [{ title: "", bullets: [""] }] },
          ],
        };
      })
    );
  };

  const removeSubtajuk = (blockIdx, subIdx) => {
    setPenerangan((prev) =>
      prev.map((b, i) => {
        if (i !== blockIdx) return b;
        return { ...b, subtajuk: b.subtajuk.filter((_, s) => s !== subIdx) };
      })
    );
  };

  const updateSubtajuk = (blockIdx, subIdx, patch) => {
    setPenerangan((prev) =>
      prev.map((b, i) => {
        if (i !== blockIdx) return b;
        return {
          ...b,
          subtajuk: b.subtajuk.map((s, si) => (si === subIdx ? { ...s, ...patch } : s)),
        };
      })
    );
  };

  const addPecahan = (blockIdx, subIdx) => {
    setPenerangan((prev) =>
      prev.map((b, i) => {
        if (i !== blockIdx) return b;
        return {
          ...b,
          subtajuk: b.subtajuk.map((s, si) => {
            if (si !== subIdx) return s;
            return { ...s, pecahan: [...s.pecahan, { title: "", bullets: [""] }] };
          }),
        };
      })
    );
  };

  const removePecahan = (blockIdx, subIdx, pecIdx) => {
    setPenerangan((prev) =>
      prev.map((b, i) => {
        if (i !== blockIdx) return b;
        return {
          ...b,
          subtajuk: b.subtajuk.map((s, si) => {
            if (si !== subIdx) return s;
            return { ...s, pecahan: s.pecahan.filter((_, pi) => pi !== pecIdx) };
          }),
        };
      })
    );
  };

  const updatePecahan = (blockIdx, subIdx, pecIdx, patch) => {
    setPenerangan((prev) =>
      prev.map((b, i) => {
        if (i !== blockIdx) return b;
        return {
          ...b,
          subtajuk: b.subtajuk.map((s, si) => {
            if (si !== subIdx) return s;
            return {
              ...s,
              pecahan: s.pecahan.map((p, pi) => (pi === pecIdx ? { ...p, ...patch } : p)),
            };
          }),
        };
      })
    );
  };

  const addBullet = (blockIdx, subIdx, pecIdx) => {
    setPenerangan((prev) =>
      prev.map((b, i) => {
        if (i !== blockIdx) return b;
        return {
          ...b,
          subtajuk: b.subtajuk.map((s, si) => {
            if (si !== subIdx) return s;
            return {
              ...s,
              pecahan: s.pecahan.map((p, pi) => {
                if (pi !== pecIdx) return p;
                return { ...p, bullets: [...p.bullets, ""] };
              }),
            };
          }),
        };
      })
    );
  };

  const updateBullet = (blockIdx, subIdx, pecIdx, bulletIdx, value) => {
    setPenerangan((prev) =>
      prev.map((b, i) => {
        if (i !== blockIdx) return b;
        return {
          ...b,
          subtajuk: b.subtajuk.map((s, si) => {
            if (si !== subIdx) return s;
            return {
              ...s,
              pecahan: s.pecahan.map((p, pi) => {
                if (pi !== pecIdx) return p;
                return {
                  ...p,
                  bullets: p.bullets.map((bb, bi) => (bi === bulletIdx ? value : bb)),
                };
              }),
            };
          }),
        };
      })
    );
  };

  const removeBullet = (blockIdx, subIdx, pecIdx, bulletIdx) => {
    setPenerangan((prev) =>
      prev.map((b, i) => {
        if (i !== blockIdx) return b;
        return {
          ...b,
          subtajuk: b.subtajuk.map((s, si) => {
            if (si !== subIdx) return s;
            return {
              ...s,
              pecahan: s.pecahan.map((p, pi) => {
                if (pi !== pecIdx) return p;
                return { ...p, bullets: p.bullets.filter((_, bi) => bi !== bulletIdx) };
              }),
            };
          }),
        };
      })
    );
  };

  // ----- Handlers (RUJUKAN) -----
  const addRujukan = () => setRujukan((prev) => [...prev, { text: "" }]);
  const removeRujukan = (idx) => setRujukan((prev) => prev.filter((_, i) => i !== idx));
  const updateRujukan = (idx, value) =>
    setRujukan((prev) => prev.map((r, i) => (i === idx ? { ...r, text: value } : r)));

  // ----- Handlers (LATIHAN & SKEMA) -----
  const addQuestion = () => {
    setLatihan((prev) => ({
      ...prev,
      questions: [...prev.questions, { qText: "", expectedPoints: 0 }],
    }));
    setSkema((prev) => [...prev, { answerBullets: [""] }]);
  };

  const removeQuestion = (idx) => {
    setLatihan((prev) => ({
      ...prev,
      questions: prev.questions.filter((_, i) => i !== idx),
    }));
    setSkema((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateQuestion = (idx, patch) => {
    setLatihan((prev) => ({
      ...prev,
      questions: prev.questions.map((q, i) => (i === idx ? { ...q, ...patch } : q)),
    }));
  };

  const addSkemaBullet = (qIdx) => {
    setSkema((prev) =>
      prev.map((s, i) => (i === qIdx ? { ...s, answerBullets: [...s.answerBullets, ""] } : s))
    );
  };

  const updateSkemaBullet = (qIdx, bIdx, value) => {
    setSkema((prev) =>
      prev.map((s, i) => {
        if (i !== qIdx) return s;
        return {
          ...s,
          answerBullets: s.answerBullets.map((b, bi) => (bi === bIdx ? value : b)),
        };
      })
    );
  };

  const removeSkemaBullet = (qIdx, bIdx) => {
    setSkema((prev) =>
      prev.map((s, i) => {
        if (i !== qIdx) return s;
        return { ...s, answerBullets: s.answerBullets.filter((_, bi) => bi !== bIdx) };
      })
    );
  };

  // ----- Generate placeholders -----
  const handleGenerate = async (section) => {
    // TODO: sambung ke backend AI Prof
    // section boleh jadi: "objektif" | "penerangan" | "rujukan" | "latihan" | "skema" | "all"
    alert(`Generate: ${section} (placeholder)`);
  };

  return (
    <div className="wim-container">
      {/* LEFT PANEL */}
      <aside className="wim-sidebar">
        <h4>Maklumat NOSS</h4>

        <label>Kod NOSS:</label>
        <input
          value={nossCode}
          onChange={(e) => setNossCode(e.target.value)}
          placeholder="Contoh: 0841-XXX-4:2021"
        />

        <label>Tajuk NOSS:</label>
        <input
          value={nossTitle}
          onChange={(e) => setNossTitle(e.target.value)}
          placeholder="Pentadbiran Masjid"
        />

        <label>Tahap:</label>
        <select value={level} onChange={(e) => setLevel(e.target.value)}>
          <option value="">Pilih Tahap</option>
          <option value="2">Tahap 2</option>
          <option value="3">Tahap 3</option>
          <option value="4">Tahap 4</option>
          <option value="5">Tahap 5</option>
        </select>

        <label>Nama Pakej Latihan:</label>
        <input
          value={paketLatihan}
          onChange={(e) => setPaketLatihan(e.target.value)}
          placeholder="Contoh: Pakej Latihan Kerja Perabot Jalan"
        />

        <label>Audience/Level:</label>
        <select value={audienceLevel} onChange={(e) => setAudienceLevel(e.target.value)}>
          <option value="asas">Asas</option>
          <option value="pertengahan">Pertengahan</option>
          <option value="lanjut">Lanjut</option>
        </select>

        <label>Upload Dokumen:</label>
        <input
          type="file"
          accept=".pdf,.doc,.docx"
          multiple
          onChange={(e) => setFiles(Array.from(e.target.files || []))}
        />
        {files?.length ? (
          <div style={{ fontSize: 12, marginTop: 6, opacity: 0.8 }}>
            {files.length} fail dipilih
          </div>
        ) : null}

        <hr style={{ margin: "14px 0", opacity: 0.3 }} />

        <button className="wim-btn wim-btn-primary" onClick={() => handleGenerate("all")}>
          Jana Semua Seksyen
        </button>
      </aside>

      {/* MAIN CONTENT */}
      <main className="wim-main">
        <div className="wim-header">
          <div>
            <h1>WIM.ai</h1>
            <div className="wim-subtitle">
              Template CIDB/JPK: Tajuk → Objektif → Penerangan → Rujukan → Latihan → Skema
            </div>
          </div>

          <div className="wim-header-actions">
            <button className="wim-btn" onClick={() => alert("TODO: Export DOCX/PDF")}>
              Export DOCX/PDF
            </button>
          </div>
        </div>

        {/* 1) TAJUK */}
        <section className="wim-section">
          <div className="wim-section-head">
            <h3>TAJUK</h3>
          </div>
          <input
            className="wim-input"
            value={tajuk}
            onChange={(e) => setTajuk(e.target.value)}
            placeholder="Masukkan tajuk modul/nota pembelajaran…"
          />
        </section>

        {/* 2) OBJEKTIF */}
        <section className="wim-section">
          <div className="wim-section-head">
            <h3>OBJEKTIF</h3>
            <button className="wim-btn wim-btn-ghost" onClick={() => handleGenerate("objektif")}>
              Jana Objektif
            </button>
          </div>
          <textarea
            className="wim-textarea"
            value={objektif}
            onChange={(e) => setObjektif(e.target.value)}
            placeholder="Modul latihan ini adalah bertujuan untuk…"
            rows={4}
          />
        </section>

        {/* 3) PENERANGAN */}
        <section className="wim-section">
          <div className="wim-section-head">
            <h3>PENERANGAN</h3>
            <div className="wim-row">
              <button className="wim-btn wim-btn-ghost" onClick={() => handleGenerate("penerangan")}>
                Jana Penerangan
              </button>
              <button className="wim-btn" onClick={addPeneranganBlock}>
                + Tambah Tajuk Isi Kandungan
              </button>
            </div>
          </div>

          {penerangan.map((block, bIdx) => {
            const blockNo = bIdx + 1;
            return (
              <div key={bIdx} className="wim-card">
                <div className="wim-card-head">
                  <div className="wim-card-title">{blockNo}) TAJUK ISI KANDUNGAN</div>
                  <button className="wim-btn wim-btn-danger" onClick={() => removePeneranganBlock(bIdx)}>
                    Buang
                  </button>
                </div>

                <label className="wim-label">{blockNo}) Tajuk Isi Kandungan</label>
                <input
                  className="wim-input"
                  value={block.titleMain}
                  onChange={(e) => updatePeneranganBlock(bIdx, { titleMain: e.target.value })}
                  placeholder="Contoh: Introduction of Blasting Work Area Preparation"
                />

                <label className="wim-label">{blockNo}.1) Kandungan</label>
                <textarea
                  className="wim-textarea"
                  rows={3}
                  value={block.kandunganText}
                  onChange={(e) => updatePeneranganBlock(bIdx, { kandunganText: e.target.value })}
                  placeholder="Huraian kandungan bagi tajuk ini…"
                />

                {/* Subtajuk */}
                <div className="wim-subblock">
                  <div className="wim-subblock-head">
                    <div className="wim-subblock-title">Sub Tajuk (a, b, c…)</div>
                    <button className="wim-btn" onClick={() => addSubtajuk(bIdx)}>
                      + Tambah Sub Tajuk
                    </button>
                  </div>

                  {block.subtajuk.map((sub, sIdx) => {
                    const letter = String.fromCharCode(97 + sIdx); // a,b,c
                    return (
                      <div key={sIdx} className="wim-subcard">
                        <div className="wim-subcard-head">
                          <div className="wim-subcard-title">
                            {letter}) Sub Tajuk
                          </div>
                          <button
                            className="wim-btn wim-btn-danger"
                            onClick={() => removeSubtajuk(bIdx, sIdx)}
                            disabled={block.subtajuk.length <= 1}
                            title={block.subtajuk.length <= 1 ? "Minimum 1 subtajuk" : ""}
                          >
                            Buang
                          </button>
                        </div>

                        <input
                          className="wim-input"
                          value={sub.title}
                          onChange={(e) => updateSubtajuk(bIdx, sIdx, { title: e.target.value })}
                          placeholder="Masukkan tajuk subtajuk…"
                        />

                        {/* Pecahan */}
                        <div className="wim-subblock">
                          <div className="wim-subblock-head">
                            <div className="wim-subblock-title">Pecahan (i, ii, iii…)</div>
                            <button className="wim-btn" onClick={() => addPecahan(bIdx, sIdx)}>
                              + Tambah Pecahan
                            </button>
                          </div>

                          {sub.pecahan.map((pec, pIdx) => {
                            const roman = toRoman(pIdx + 1);
                            return (
                              <div key={pIdx} className="wim-subcard">
                                <div className="wim-subcard-head">
                                  <div className="wim-subcard-title">{roman}) Pecahan Sub Tajuk</div>
                                  <button
                                    className="wim-btn wim-btn-danger"
                                    onClick={() => removePecahan(bIdx, sIdx, pIdx)}
                                    disabled={sub.pecahan.length <= 1}
                                    title={sub.pecahan.length <= 1 ? "Minimum 1 pecahan" : ""}
                                  >
                                    Buang
                                  </button>
                                </div>

                                <input
                                  className="wim-input"
                                  value={pec.title}
                                  onChange={(e) => updatePecahan(bIdx, sIdx, pIdx, { title: e.target.value })}
                                  placeholder="Masukkan tajuk pecahan…"
                                />

                                <div className="wim-subblock">
                                  <div className="wim-subblock-head">
                                    <div className="wim-subblock-title">• Perincian (bullets)</div>
                                    <button className="wim-btn" onClick={() => addBullet(bIdx, sIdx, pIdx)}>
                                      + Tambah Bullet
                                    </button>
                                  </div>

                                  {pec.bullets.map((bb, bi) => (
                                    <div key={bi} className="wim-row" style={{ alignItems: "center" }}>
                                      <input
                                        className="wim-input"
                                        value={bb}
                                        onChange={(e) => updateBullet(bIdx, sIdx, pIdx, bi, e.target.value)}
                                        placeholder="Perincian sub tajuk…"
                                      />
                                      <button
                                        className="wim-btn wim-btn-danger"
                                        onClick={() => removeBullet(bIdx, sIdx, pIdx, bi)}
                                        disabled={pec.bullets.length <= 1}
                                        title={pec.bullets.length <= 1 ? "Minimum 1 bullet" : ""}
                                      >
                                        Buang
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </section>

        {/* 4) RUJUKAN */}
        <section className="wim-section">
          <div className="wim-section-head">
            <h3>RUJUKAN</h3>
            <div className="wim-row">
              <button className="wim-btn wim-btn-ghost" onClick={() => handleGenerate("rujukan")}>
                Jana Rujukan
              </button>
              <button className="wim-btn" onClick={addRujukan}>
                + Tambah Rujukan
              </button>
            </div>
          </div>

          {rujukan.map((r, idx) => (
            <div key={idx} className="wim-row" style={{ alignItems: "center" }}>
              <div style={{ width: 26, fontWeight: 700 }}>{idx + 1}.</div>
              <input
                className="wim-input"
                value={r.text}
                onChange={(e) => updateRujukan(idx, e.target.value)}
                placeholder="Contoh: Construction Occupational Competency Standard, CIDB, ..."
              />
              <button
                className="wim-btn wim-btn-danger"
                onClick={() => removeRujukan(idx)}
                disabled={rujukan.length <= 1}
              >
                Buang
              </button>
            </div>
          ))}
        </section>

        {/* 5) LATIHAN */}
        <section className="wim-section">
          <div className="wim-section-head">
            <h3>LATIHAN</h3>
            <div className="wim-row">
              <button className="wim-btn wim-btn-ghost" onClick={() => handleGenerate("latihan")}>
                Jana Latihan
              </button>
              <button className="wim-btn" onClick={addQuestion}>
                + Tambah Soalan
              </button>
            </div>
          </div>

          <label className="wim-label">Arahan & Maklumat</label>
          <textarea
            className="wim-textarea"
            rows={5}
            value={latihan.instructionText}
            onChange={(e) =>
              setLatihan((prev) => ({ ...prev, instructionText: e.target.value }))
            }
          />

          <div className="wim-card" style={{ marginTop: 12 }}>
            {latihan.questions.map((q, idx) => (
              <div key={idx} className="wim-subcard">
                <div className="wim-subcard-head">
                  <div className="wim-subcard-title">{idx + 1}. Soalan</div>
                  <button
                    className="wim-btn wim-btn-danger"
                    onClick={() => removeQuestion(idx)}
                    disabled={latihan.questions.length <= 1}
                  >
                    Buang
                  </button>
                </div>

                <textarea
                  className="wim-textarea"
                  rows={3}
                  value={q.qText}
                  onChange={(e) => updateQuestion(idx, { qText: e.target.value })}
                  placeholder="Contoh: Berikan tiga (3) contoh…"
                />

                <div className="wim-row" style={{ alignItems: "center" }}>
                  <label className="wim-label" style={{ margin: 0, width: 200 }}>
                    Bil. poin/jawapan (opsyen)
                  </label>
                  <input
                    className="wim-input"
                    style={{ maxWidth: 120 }}
                    type="number"
                    value={q.expectedPoints}
                    onChange={(e) =>
                      updateQuestion(idx, { expectedPoints: Number(e.target.value || 0) })
                    }
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 6) SKEMA JAWAPAN */}
        <section className="wim-section">
          <div className="wim-section-head">
            <h3>SKEMA JAWAPAN (UNTUK PENGAJAR)</h3>
            <button className="wim-btn wim-btn-ghost" onClick={() => handleGenerate("skema")}>
              Jana Skema
            </button>
          </div>

          <div className="wim-card">
            {latihan.questions.map((q, qIdx) => (
              <div key={qIdx} className="wim-subcard">
                <div className="wim-subcard-head">
                  <div className="wim-subcard-title">{qIdx + 1}. Jawapan</div>
                  <button className="wim-btn" onClick={() => addSkemaBullet(qIdx)}>
                    + Bullet Jawapan
                  </button>
                </div>

                {skema[qIdx]?.answerBullets?.map((b, bIdx) => (
                  <div key={bIdx} className="wim-row" style={{ alignItems: "center" }}>
                    <div style={{ width: 18 }}>●</div>
                    <input
                      className="wim-input"
                      value={b}
                      onChange={(e) => updateSkemaBullet(qIdx, bIdx, e.target.value)}
                      placeholder="Jawapan ringkas dalam bullet…"
                    />
                    <button
                      className="wim-btn wim-btn-danger"
                      onClick={() => removeSkemaBullet(qIdx, bIdx)}
                      disabled={skema[qIdx]?.answerBullets?.length <= 1}
                    >
                      Buang
                    </button>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </section>

        <div style={{ height: 30 }} />
      </main>
    </div>
  );
}
