import React, { useState } from "react";

export default function WIMPage() {
  const [nossCode, setNossCode] = useState("");
  const [nossTitle, setNossTitle] = useState("");
  const [level, setLevel] = useState("");
  const [prompt, setPrompt] = useState("");

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

        <label>Upload Dokumen:</label>
        <input type="file" accept=".pdf,.doc,.docx" />
      </aside>

      {/* MAIN CONTENT */}
      <main className="wim-main">
        <h1>WIM.ai</h1>

        <div className="wim-chatbox">
          <input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Taip arahan WIM di sini..."
          />
          <button>➤</button>
        </div>
      </main>
    </div>
  );
}
