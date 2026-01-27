export default function WimPage({ onBack }) {
  return (
    <div style={{ padding: 20, fontFamily: "system-ui" }}>
      <h2>WIM Module — Coming Soon</h2>
      {onBack && (
        <button onClick={onBack} style={{ marginTop: 12 }}>
          Back
        </button>
      )}
    </div>
  );
}
