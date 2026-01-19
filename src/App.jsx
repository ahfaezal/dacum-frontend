import React, { useEffect, useState } from "react";
import ClusterPage from "./ClusterPage.jsx";
import LiveBoard from "./LiveBoard.jsx";
import PanelPage from "./PanelPage.jsx";
import System2CuEntry from "./pages/System2CuEntry";
import System2Compare from "./pages/System2Compare";

function parseHash() {
  const h = String(window.location.hash || "#/board");
  const [pathPart, qs] = h.replace(/^#/, "").split("?");
  const path = pathPart || "/board";
  const params = new URLSearchParams(qs || "");
  return { path, params };
}

/** ✅ Error Boundary supaya tak blank dan boleh nampak error sebenar */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { err: null, info: null };
  }
  static getDerivedStateFromError(err) {
    return { err };
  }
  componentDidCatch(err, info) {
    this.setState({ info });
    // log untuk console juga
    console.error("UI crashed:", err, info);
  }
  render() {
    if (this.state.err) {
      const msg =
        this.state.err?.message ||
        String(this.state.err) ||
        "Unknown error";
      return (
        <div style={{ padding: 20, fontFamily: "system-ui" }}>
          <h2 style={{ marginTop: 0, color: "#b00020" }}>
            UI Crash (ErrorBoundary)
          </h2>
          <div style={{ marginBottom: 10 }}>
            <b>Message:</b> {msg}
          </div>
          <div style={{ marginBottom: 10 }}>
            <b>Route:</b> {String(window.location.hash || "")}
          </div>
          <details open style={{ whiteSpace: "pre-wrap" }}>
            <summary>Stack</summary>
            <div style={{ marginTop: 8, fontSize: 12 }}>
              {this.state.err?.stack || "(no stack)"}
            </div>
          </details>
          <div style={{ marginTop: 14, opacity: 0.85 }}>
            Tip: buka Console dan copy “Message” di atas, kemudian paste dekat sini.
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const [{ path, params }, setRoute] = useState(parseHash());

  useEffect(() => {
    const onChange = () => setRoute(parseHash());
    window.addEventListener("hashchange", onChange);

    if (!window.location.hash) window.location.hash = "#/board";

    return () => window.removeEventListener("hashchange", onChange);
  }, []);

  const goBoard = () => (window.location.hash = "#/board");
  const goPanel = () => (window.location.hash = "#/panel");
  const goCluster = (sessionId) =>
    (window.location.hash = `#/cluster?session=${encodeURIComponent(
      sessionId || ""
    )}`);

  let view = null;

  if (path === "/panel") {
    view = <PanelPage />;
  } else if (path === "/cluster") {
    const sid = params.get("session") || "Masjid";
    view = <ClusterPage initialSessionId={sid} onBack={goBoard} />;
  } else if (path === "/s2/cu-entry") {
    view = <System2CuEntry />;
  } else if (path === "/s2/compare") {
    view = <System2Compare />;
  } else {
    view = <LiveBoard onAgreed={(sid) => goCluster(sid)} goPanel={goPanel} />;
  }

  return <ErrorBoundary>{view}</ErrorBoundary>;
}
