export default function Header({
  address,
  isConnected,
  onConnect,
  onDisconnect,
  connectStatus,
}) {
  return (
    <header className="header">
      <div className="container header-row">
        <div className="brand">
          <div className="logo-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <div>
            <div className="brand-name">ProofDrop</div>
            <div className="brand-tag">on Monad</div>
          </div>
        </div>

        <div className="wallet">
          {isConnected ? (
            <>
              <span className="addr" title={address}>
                {address?.slice(0, 6)}…{address?.slice(-4)}
              </span>
              <button className="btn ghost" onClick={onDisconnect}>
                Disconnect
              </button>
            </>
          ) : (
            <button
              className="btn primary"
              disabled={connectStatus === "pending"}
              onClick={onConnect}
            >
              {connectStatus === "pending" ? "Connecting…" : "Connect Wallet"}
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
