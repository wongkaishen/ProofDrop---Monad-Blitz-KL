import { useEffect, useMemo, useState } from "react";
import {
  useAccount,
  useChainId,
  useConnect,
  useDisconnect,
  useSwitchChain,
} from "wagmi";

import Header from "./components/Header.jsx";
import QuestList from "./components/QuestList.jsx";
import ProofModal from "./components/ProofModal.jsx";
import BadgeGrid from "./components/BadgeGrid.jsx";
import WalletInstallCard from "./components/WalletInstallCard.jsx";
import { fetchQuests } from "./api.js";
import { monadTestnet } from "./wagmi.js";

const TABS = [
  { id: "quests", label: "Quests" },
  { id: "badges", label: "My Badges" },
];

const hasInjectedProvider = () =>
  typeof window !== "undefined" && Boolean(window.ethereum);

function describeConnectError(err) {
  if (!err) return null;
  const msg = String(err.message || err);
  // Friendly message when no wallet extension is installed.
  if (/Provider not found/i.test(msg) || /No injected/i.test(msg)) {
    return (
      "No injected wallet detected. Install MetaMask (or another EVM wallet " +
      "extension) and reload this page."
    );
  }
  if (/User rejected/i.test(msg) || /denied/i.test(msg)) {
    return "Connection request was rejected in your wallet.";
  }
  return msg;
}

export default function App() {
  const { address, isConnected } = useAccount();
  const { connectors, connect, status: connectStatus, error: connectError } = useConnect();
  const { disconnect } = useDisconnect();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();

  const [tab, setTab] = useState("quests");
  const [quests, setQuests] = useState([]);
  const [activeQuest, setActiveQuest] = useState(null);
  const [error, setError] = useState(null);
  const [userTriedConnect, setUserTriedConnect] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchQuests()
      .then((q) => {
        if (!cancelled) setQuests(q);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const onWrongNetwork = isConnected && chainId !== monadTestnet.id;
  const friendlyConnectError = userTriedConnect ? describeConnectError(connectError) : null;
  const questSummary = useMemo(() => {
    const image = quests.filter((q) => q.kind === "image").length;
    const text = quests.filter((q) => q.kind === "text").length;
    return { total: quests.length, image, text };
  }, [quests]);

  const handleConnect = () => {
    setUserTriedConnect(true);
    if (!hasInjectedProvider()) {
      // Surface the missing-wallet hint without ever calling the connector,
      // which would throw the raw "Provider not found" error.
      return;
    }
    const c = connectors[0];
    if (c) connect({ connector: c });
  };

  return (
    <div className="app">
      <Header
        address={address}
        isConnected={isConnected}
        onConnect={handleConnect}
        onDisconnect={() => disconnect()}
        connectStatus={connectStatus}
      />

      <main className="container">
        <section className="hero">
          <div className="hero-copy">
            <span className="badge-pill">Monad Testnet · Chain {monadTestnet.id}</span>
            <h1>Proof-gated badges for real actions.</h1>
            <p className="subtitle">
              Pick a quest, submit text or photo proof, and mint once the verifier
              signs your claim voucher.
            </p>
            <div className="hero-actions">
              <button
                className="btn primary big"
                onClick={isConnected ? undefined : handleConnect}
                disabled={isConnected}
              >
                {isConnected ? "Wallet connected" : "Connect wallet"}
              </button>
              <a
                className="btn ghost big"
                href="https://testnet.monadexplorer.com"
                target="_blank"
                rel="noreferrer"
              >
                Explorer
              </a>
            </div>
          </div>
          <HeroPanel
            isConnected={isConnected}
            onWrongNetwork={onWrongNetwork}
            questSummary={questSummary}
          />
        </section>

        {userTriedConnect && !hasInjectedProvider() && (
          <WalletInstallCard />
        )}
        {hasInjectedProvider() && friendlyConnectError && (
          <div className="alert error">{friendlyConnectError}</div>
        )}
        {error && <div className="alert error">{error}</div>}
        {onWrongNetwork && (
          <div className="alert warn">
            Wrong network. Click below to switch your wallet to Monad Testnet —
            it will be added automatically if you don't have it yet.{" "}
            <button
              className="link"
              onClick={() => switchChain({ chainId: monadTestnet.id })}
            >
              Switch to Monad Testnet →
            </button>
          </div>
        )}

        <nav className="tabs" aria-label="Primary views">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={"tab " + (tab === t.id ? "active" : "")}
              onClick={() => setTab(t.id)}
            >
              {t.label}
              {t.id === "quests" && quests.length > 0 && (
                <span className="tab-count">{quests.length}</span>
              )}
            </button>
          ))}
        </nav>

        {tab === "quests" && (
          <QuestList
            quests={quests}
            onPickQuest={(q) => {
              if (!isConnected) {
                handleConnect();
                return;
              }
              setActiveQuest(q);
            }}
          />
        )}
        {tab === "badges" && <BadgeGrid address={address} />}
      </main>

      <footer className="footer">
        <span>ProofDrop · Monad Blitz KL</span>
        <span>
          AI verification + EIP-712 vouchers ·{" "}
          <a
            href="https://testnet.monadexplorer.com"
            target="_blank"
            rel="noreferrer"
          >
            Explorer
          </a>
        </span>
      </footer>

      {activeQuest && (
        <ProofModal
          quest={activeQuest}
          address={address}
          onClose={() => setActiveQuest(null)}
        />
      )}
    </div>
  );
}

function HeroPanel({ isConnected, onWrongNetwork, questSummary }) {
  const walletState = isConnected
    ? onWrongNetwork
      ? "Wrong network"
      : "Ready"
    : "Not connected";

  return (
    <aside className="hero-panel" aria-label="ProofDrop flow">
      <div className="panel-topline">
        <span>Drop status</span>
        <strong>{walletState}</strong>
      </div>
      <div className="quest-meter">
        <div>
          <span className="meter-value">{questSummary.total || "..."}</span>
          <span className="meter-label">active quests</span>
        </div>
        <div>
          <span className="meter-value">{questSummary.text}</span>
          <span className="meter-label">text</span>
        </div>
        <div>
          <span className="meter-value">{questSummary.image}</span>
          <span className="meter-label">photo</span>
        </div>
      </div>
      <ol className="proof-route">
        <li>
          <span>1</span>
          <div>
            <strong>Submit proof</strong>
            <p>Text or image evidence from a quest card.</p>
          </div>
        </li>
        <li>
          <span>2</span>
          <div>
            <strong>Verifier signs</strong>
            <p>Backend returns an EIP-712 claim voucher.</p>
          </div>
        </li>
        <li>
          <span>3</span>
          <div>
            <strong>Mint badge</strong>
            <p>Your wallet submits the signed claim on Monad.</p>
          </div>
        </li>
      </ol>
    </aside>
  );
}
