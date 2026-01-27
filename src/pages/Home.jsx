import { useNavigate } from "react-router-dom";
import FeatureCard from "../components/FeatureCard";

export default function Home() {
  const navigate = useNavigate();

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
          <FeatureCard title="NOSS.ai" onClick={() => navigate("/panel")} />
          <FeatureCard title="WIM.ai" disabled />
          <FeatureCard title="SOALAN.ai" disabled />
        </div>
      </div>

      <div style={styles.right} />
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
    flex: 1,
    padding: "80px",
    color: "#fff",
  },
  right: {
    flex: 1,
  },
  badge: {
    background: "#fff",
    color: "#000",
    display: "inline-block",
    padding: "8px 16px",
    borderRadius: 20,
    marginBottom: 40,
  },
  title: {
    fontSize: 48,
    fontWeight: "bold",
  },
  line: {
    width: 120,
    border: "2px solid #fff",
    margin: "20px 0",
  },
  subtitle: {
    fontSize: 20,
    marginBottom: 40,
  },
  features: {
    display: "flex",
    gap: 20,
  },
};
