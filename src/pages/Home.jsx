import FeatureCard from "../components/FeatureCard";
import pfhLogo from "../assets/logo-pfh.png";

export default function Home() {
  const go = (hashPath) => {
    window.location.hash = hashPath;
  };

  return (
    <div style={styles.wrapper}>
      {/* subtle overlay untuk nampak lebih premium */}
      <div style={styles.overlay} />

      <div style={styles.container}>
        {/* LEFT */}
        <div style={styles.leftCard}>
          <div style={styles.brandRow}>
            <img src={pfhLogo} alt="PFH Logo" style={styles.logo} />
            <div style={styles.badge}>Powered by PFH Digital 2026</div>
          </div>

          <h1 style={styles.title}>Crafting Digital Excellence</h1>
          <div style={styles.line} />

          <p style={styles.subtitle}>
            Your Gateway to Exceptional <br />
            <strong>STANDARD DEVELOPMENT</strong>
          </p>

          <div style={styles.features}>
            <FeatureCard title="NOSS.ai" onClick={() => go("#/panel")} />
            <FeatureCard title="WIM.ai" onClick={() => go("#/wim")} />
            <FeatureCard title="SOALAN.ai" onClick={() => go("#/soalan")} />
          </div>

          <div style={styles.quickLinks}>
            <button style={styles.linkBtn} onClick={() => go("#/board")}>
              Go to LiveBoard
            </button>
            <button style={styles.linkBtn} onClick={() => go("#/panel")}>
              Go to Panel Input
            </button>
          </div>

          <div style={styles.footerMark}>PFH Digital.ai 2026</div>
        </div>

        {/* RIGHT */}
        <div style={styles.rightArea}>
          <div style={styles.rightCard}>
            <div style={styles.rightTitle}>iNOSS</div>
            <div style={styles.rightDesc}>
              NOSS / WIM / SOALAN – workflow-driven standard development
            </div>

            <div style={styles.chips}>
              <span style={styles.chip}>DACUM</span>
              <span style={styles.chip}>AI Clustering</span>
              <span style={styles.chip}>CPC → CP</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const styles = {
  wrapper: {
    position: "relative",
    minHeight: "100vh",
    background: "linear-gradient(135deg, #e66a2c 50%, #0b3c6d 50%)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "28px 16px",
    overflow: "hidden",
  },
  overlay: {
    position: "absolute",
    inset: 0,
    background:
      "radial-gradient(circle at 20% 20%, rgba(255,255,255,0.12), transparent 40%), radial-gradient(circle at 80% 80%, rgba(255,255,255,0.10), transparent 45%)",
    pointerEvents: "none",
  },

  container: {
    position: "relative",
    width: "min(1100px, 100%)",
    display: "grid",
    gridTemplateColumns: "1.15fr 0.85fr",
    gap: 18,
  },

  leftCard: {
    borderRadius: 24,
    padding: "44px 44px",
    color: "#fff",
    background: "rgba(255,255,255,0.08)",
    border: "1px solid rgba(255,255,255,0.18)",
    boxShadow: "0 18px 50px rgba(0,0,0,0.35)",
    backdropFilter: "blur(10px)",
  },

  rightArea: {
    position: "relative",
    minHeight: 420,
  },

  brandRow: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    marginBottom: 22,
    flexWrap: "wrap",
  },
  logo: {
    height: 56,
    width: "auto",
    display: "block",
  },
  badge: {
    background: "rgba(255,255,255,0.92)",
    color: "#111",
    display: "inline-block",
    padding: "10px 16px",
    borderRadius: 999,
    boxShadow: "0 10px 26px rgba(0,0,0,0.25)",
    fontSize: 13,
    fontWeight: 700,
  },

  title: {
    fontSize: 56,
    fontWeight: 900,
    lineHeight: 1.05,
    margin: 0,
    letterSpacing: -0.5,
    textShadow: "0 10px 20px rgba(0,0,0,0.35)",
  },
  line: {
    width: 170,
    height: 3,
    background: "rgba(255,255,255,0.85)",
    borderRadius: 20,
    margin: "20px 0 16px",
  },
  subtitle: {
    fontSize: 20,
    marginBottom: 28,
    opacity: 0.95,
    lineHeight: 1.35,
  },

  features: {
    display: "flex",
    gap: 18,
    alignItems: "flex-start",
    flexWrap: "wrap",
    marginTop: 8,
  },

  quickLinks: {
    display: "flex",
    gap: 12,
    marginTop: 22,
    flexWrap: "wrap",
  },
  linkBtn: {
    background: "rgba(255,255,255,0.14)",
    border: "1px solid rgba(255,255,255,0.30)",
    color: "#fff",
    padding: "10px 14px",
    borderRadius: 14,
    cursor: "pointer",
    fontWeight: 700,
    transition: "transform 120ms ease, background 120ms ease",
  },

  footerMark: {
    marginTop: 20,
    fontSize: 12,
    opacity: 0.75,
  },

  rightCard: {
    position: "absolute",
    right: 0,
    bottom: 0,
    left: 0,
    borderRadius: 24,
    padding: 22,
    background: "rgba(255,255,255,0.10)",
    border: "1px solid rgba(255,255,255,0.18)",
    boxShadow: "0 18px 50px rgba(0,0,0,0.35)",
    backdropFilter: "blur(10px)",
    color: "#fff",
  },
  rightTitle: {
    fontSize: 28,
    fontWeight: 900,
    marginBottom: 6,
    letterSpacing: -0.2,
  },
  rightDesc: {
    fontSize: 14,
    opacity: 0.92,
    lineHeight: 1.55,
    marginBottom: 14,
  },

  chips: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
  },
  chip: {
    fontSize: 12,
    padding: "8px 10px",
    borderRadius: 999,
    background: "rgba(255,255,255,0.12)",
    border: "1px solid rgba(255,255,255,0.16)",
    opacity: 0.95,
    fontWeight: 700,
  },
};

/**
 * Nota:
 * Jika FeatureCard anda memang ada `disabled` behaviour,
 * kita dah buang `disabled` untuk WIM.ai & SOALAN.ai supaya boleh klik.
 */
