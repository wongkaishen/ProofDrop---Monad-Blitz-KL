import { useEffect, useState } from "react";
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
          <span className="badge-pill">Built on Monad Testnet · Chain {monadTestnet.id}</span>
          <h1>Prove it. Mint it.</h1>
          <p className="subtitle">
            ProofDrop turns small real-world actions into on-chain NFT badges.
            Complete a quest, upload your proof, let our AI confirm it — then claim
            your badge on the Monad blockchain.
          </p>
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

        <nav className="tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={"tab " + (tab === t.id ? "active" : "")}
              onClick={() => setTab(t.id)}
            >
              {t.label}
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
