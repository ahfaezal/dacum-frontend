import FeatureCard from "../components/FeatureCard";

export default function Home() {
  const go = (hashPath) => {
    window.location.hash = hashPath;
  };

  return (
    <div style={styles.wrapper}>
      <div style={styles.left}>
        <div style={styles.badge}>Powered by PFH Digital 2026</div>

        <h1 style={styles.title}>Crafting Digital Excellence</h1>
        <hr style={styles.line} />
        <p style={styles.subtitle}>
          Your Gateway to Exceptional <br />
          <strong>STANDARD DEVELOPMENT</strong>
        </p>

        <div style={styles.features}>
          <FeatureCard title="NOSS.ai" onClick={() => go("#/panel")} />
          <FeatureCard title="WIM.ai" disabled />
          <FeatureCard title="SOALAN.ai" disabled />
        </div>

        <div style={styles.quickLinks}>
          <button style={styles.linkBtn} onClick={() => go("#/board")}>
            Go to LiveBoard
          </button>
          <button style={styles.linkBtn} onClick={() => go("#/panel")}>
            Go to Panel Input
          </button>
        </div>
      </div>

      <div style={styles.right}>
        <div style={styles.rightCard}>
          <div style={styles.rightTitle}>iNOSS</div>
          <div style={styles.rightDesc}>
            NOSS / WIM / SOALAN – workflow-driven standard development
          </div>
        </div>
      </div>
    </div>
  );
}

const styles = {
  wrapper: {
    display: "flex",
    height: "100vh",
    background: "linear-gradient(135deg, #e66a2c 50%, #0b3c6d 50%)",
  },
  left: {
    flex: 1.1,
    padding: "70px 70px",
    color: "#fff",
  },
  right: {
    flex: 0.9,
    position: "relative",
  },
  badge: {
    background: "#fff",
    color: "#000",
    display: "inline-block",
    padding: "10px 18px",
    borderRadius: 24,
    marginBottom: 40,
    boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
  },
  title: {
    fontSize: 56,
    fontWeight: 800,
    lineHeight: 1.05,
    margin: 0,
    textShadow: "0 8px 18px rgba(0,0,0,0.35)",
  },
  line: {
    width: 160,
    border: "2px solid rgba(255,255,255,0.85)",
    margin: "22px 0 18px",
  },
  subtitle: {
    fontSize: 22,
    marginBottom: 34,
    opacity: 0.95,
  },
  features: {
    display: "flex",
    gap: 22,
    alignItems: "flex-start",
    flexWrap: "wrap",
    marginTop: 10,
  },
  quickLinks: {
    display: "flex",
    gap: 12,
    marginTop: 26,
    flexWrap: "wrap",
  },
  linkBtn: {
    background: "rgba(255,255,255,0.15)",
    border: "1px solid rgba(255,255,255,0.35)",
    color: "#fff",
    padding: "10px 14px",
    borderRadius: 12,
    cursor: "pointer",
    fontWeight: 600,
  },
  rightCard: {
    position: "absolute",
    right: 40,
    bottom: 40,
    width: "70%",
    background: "rgba(255,255,255,0.12)",
    border: "1px solid rgba(255,255,255,0.18)",
    borderRadius: 24,
    padding: 22,
    backdropFilter: "blur(10px)",
    boxShadow: "0 16px 40px rgba(0,0,0,0.35)",
    color: "#fff",
  },
  rightTitle: {
    fontSize: 28,
    fontWeight: 800,
    marginBottom: 6,
  },
  rightDesc: {
    fontSize: 14,
    opacity: 0.9,
    lineHeight: 1.5,
  },
};
