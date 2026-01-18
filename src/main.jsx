import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import LiveBoard from "./LiveBoard.jsx";     // pastikan fail & path betul
import ClusterPage from "./ClusterPage.jsx"; // pastikan fail & path betul

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        {/* Default: terus ke Live Board */}
        <Route path="/" element={<Navigate to="/board" replace />} />

        {/* Paparan 1: Live Board */}
        <Route path="/board" element={<LiveBoard />} />

        {/* Paparan 3: Clustering CU */}
        <Route path="/cluster" element={<ClusterPage />} />

        {/* fallback */}
        <Route path="*" element={<Navigate to="/board" replace />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
