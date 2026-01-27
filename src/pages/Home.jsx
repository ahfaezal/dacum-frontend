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
          <FeatureCard
            title="NOSS.ai"
            onClick={() => navigate("/panel")}
          />
          <FeatureCard
            title="WIM.ai"
            disabled
          />
          <FeatureCard
            title="SOALAN.ai"
            disabled
          />
        </div>
      </div>

      <div style={styles.right} />
    </div>
  );
}
