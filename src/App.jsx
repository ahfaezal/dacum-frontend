import React, { useEffect, useState } from "react";
import ClusterPage from "./ClusterPage.jsx";
import LiveBoard from "./pages/LiveBoard.jsx";

function parseHash() {
  // contoh:
  // #/board
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
    return () => window.removeEventListener("hashchange", onChange);
  }, []);

  const goBoard = () => (window.location.hash = "#/board");
  const goCluster = (sessionId) =>
    (window.location.hash = `#/cluster?session=${encodeURIComponent(sessionId || "")}`);

  if (path === "/cluster") {
    const sid = params.get("session") || "Masjid";
    return <ClusterPage initialSessionId={sid} onBack={goBoard} />;
  }

  // default board
  return <LiveBoard onAgreed={(sid) => goCluster(sid)} />;
}
