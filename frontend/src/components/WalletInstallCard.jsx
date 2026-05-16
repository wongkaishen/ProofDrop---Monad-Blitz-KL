const MONAD_FAUCET = "https://faucet.monad.xyz";
const METAMASK_INSTALL = "https://metamask.io/download/";
const RABBY_INSTALL = "https://rabby.io/";

export default function WalletInstallCard() {
  return (
    <div className="wallet-install">
      <div className="wallet-install-row">
        <div className="wallet-install-text">
          <h3>You'll need an EVM wallet to mint on Monad Testnet</h3>
          <p>
            Install a browser wallet, refresh this page, then click{" "}
            <strong>Connect Wallet</strong> — Monad Testnet (chain 10143) will
            be added to your wallet automatically the first time you switch.
          </p>
        </div>
        <div className="wallet-install-actions">
          <a
            className="btn primary"
            href={METAMASK_INSTALL}
            target="_blank"
            rel="noreferrer"
          >
            Install MetaMask ↗
          </a>
          <a
            className="btn ghost"
            href={RABBY_INSTALL}
            target="_blank"
            rel="noreferrer"
          >
            Install Rabby ↗
          </a>
          <button
            className="btn ghost"
            onClick={() => window.location.reload()}
          >
            I've installed it — reload
          </button>
        </div>
      </div>
      <div className="wallet-install-foot">
        <span className="muted">
          Need testnet MON for gas?
        </span>
        <a href={MONAD_FAUCET} target="_blank" rel="noreferrer" className="link">
          Open the Monad Testnet faucet ↗
        </a>
      </div>
    </div>
  );
}
