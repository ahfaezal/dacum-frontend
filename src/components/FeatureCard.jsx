export default function FeatureCard({ title, onClick, disabled }) {
  return (
    <div
      onClick={!disabled ? onClick : null}
      style={{
        ...styles.card,
        opacity: disabled ? 0.4 : 1,
        cursor: disabled ? "not-allowed" : "pointer"
      }}
    >
      <div style={styles.icon}>{"</>"}</div>
      <div>{title}</div>
      {disabled && <small>Coming Soon</small>}
    </div>
  );
}

const styles = {
  card: {
    border: "1px solid #fff",
    borderRadius: 10,
    padding: 20,
    textAlign: "center",
    width: 120,
    color: "#fff"
  },
  icon: {
    fontSize: 24,
    marginBottom: 8
  }
};
