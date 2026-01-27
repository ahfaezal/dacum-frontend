export default function SoalanPage({ onBack }) {
  return (
    <div style={{ padding: 20, fontFamily: "system-ui" }}>
      <h2>SOALAN Module — Coming Soon</h2>
      {onBack && (
        <button onClick={onBack} style={{ marginTop: 12 }}>
          Back
        </button>
      )}
    </div>
  );
}
