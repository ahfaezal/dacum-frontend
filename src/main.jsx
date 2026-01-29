import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";

import App from "./App.jsx";
import LiveBoard from "./LiveBoard.jsx";
import PanelPage from "./PanelPage.jsx";
import ClusterPage from "./ClusterPage.jsx";
import CpcPage from "./CpcPage.jsx";

// FASA 3 (CP)
import CpDashboard from "./pages/CpDashboard.jsx";
import CpEditor from "./pages/CpEditor.jsx";
import CoCUDashboard from "./pages/CoCUDashboard.jsx";

/**
 * Router ringkas guna hash (#)
 * Elak react-router untuk deploy Vercel yang laju & stabil
 *
 * Routing:
 *  - #/board      -> LiveBoard
 *  - #/panel      -> PanelPage
 *  - #/cluster    -> ClusterPage
 *  - #/cpc        -> CpcPage
 *  - #/cp         -> CpDashboard
 *  - #/cp         -> CoCUDashboard
 *  - #/cp-editor  -> CpEditor
 */
function Router() {
  // ✅ Jadikan hash reactive (tanpa ini, URL berubah tapi page tak bertukar)
  const [hash, setHash] = useState(window.location.hash || "");

  useEffect(() => {
    const onHashChange = () => setHash(window.location.hash || "");
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  // ===== ROUTES (HASH) =====
  if (hash.startsWith("#/board")) return <LiveBoard />;
  if (hash.startsWith("#/panel")) return <PanelPage />;
  if (hash.startsWith("#/cluster")) return <ClusterPage />;
  if (hash.startsWith("#/cpc")) return <CpcPage />;

  // FASA 3: CP
  // ⚠️ Susunan ini betul: cp-editor mesti di atas cp (supaya tak kena match "#/cp")
  if (hash.startsWith("#/cp-editor")) return <CpEditor />;
  if (hash.startsWith("#/cp")) return <CpDashboard />;
  if (hash.startsWith("#/cp")) return <CoCUDashboard />;

  /**
   * DEFAULT:
   * Jika ada ?session=xxx → terus buka CPC
   * Jika tiada → App (landing / menu)
   */
  const params = new URLSearchParams(window.location.search);
  if (params.get("session")) return <CpcPage />;

  return <App />;
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Router />
  </React.StrictMode>
);
