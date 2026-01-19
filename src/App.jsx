import React, { useEffect, useState } from "react";
import ClusterPage from "./ClusterPage.jsx";
import LiveBoard from "./LiveBoard.jsx";
import PanelPage from "./PanelPage.jsx";
import System2CuEntry from "./pages/System2CuEntry";
import System2Compare from "./pages/System2Compare";

function parseHash() {
  // contoh:
  // #/board
  // #/panel
  // #/cluster?session=Masjid
  const h = String(window.location.hash || "#/board");
  const [pathPart, qs] = h.replace(/^#/, "").split("?");
  const path = pathPart || "/board";
  const params = new URLSearchParams(qs || "");
  return { path, params };
}

export default function App() {
  const [{ path, params }, setRoute] = useState(parseHash());

  useEffect(() => {
    const onChange = () => setRoute(parseHash());
    window.addEventListener("hashchange", onChange);

    // pastikan ada default hash
    if (!window.location.hash) window.location.hash = "#/board";

    return () => window.removeEventListener("hashchange", onChange);
  }, []);

  const goBoard = () => (window.location.hash = "#/board");
  const goPanel = () => (window.location.hash = "#/panel");
  const goCluster = (sessionId) =>
    (window.location.hash = `#/cluster?session=${encodeURIComponent(
      sessionId || ""
    )}`);

// PANEL (handphone) - input kad sahaja
if (path === "/panel") {
  return <PanelPage />;
}

// CLUSTER (fasilitator selepas Agreed)
if (path === "/cluster") {
  const sid = params.get("session") || "Masjid";
  return <ClusterPage initialSessionId={sid} onBack={goBoard} />;
}

// SISTEM 2 – CU ENTRY (Page 2.1)
if (path === "/s2/cu-entry") {
  return <System2CuEntry />;
}

// SISTEM 2 – CU BASKET COMPARATOR (Page 2.2)
if (path === "/s2/compare") {
  return <System2Compare />;
}

// DEFAULT: LIVE BOARD (fasilitator)
return <LiveBoard onAgreed={(sid) => goCluster(sid)} goPanel={goPanel} />;
}
