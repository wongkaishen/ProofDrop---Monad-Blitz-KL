import { useEffect, useState } from "react";

import TaskCard from "../components/TaskCard.jsx";
import CreateTaskModal from "../components/CreateTaskModal.jsx";
import SubmitTaskProofModal from "../components/SubmitTaskProofModal.jsx";
import { tasksApi } from "../api.js";

const FILTERS = [
  { id: "mine", label: "My Tasks" },
  { id: "all", label: "All" },
];

export default function Tasks({ address, isConnected, onConnect, onActivity }) {
  const [filter, setFilter] = useState("mine");
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [activeTask, setActiveTask] = useState(null);

  const reload = () => {
    if (!isConnected && filter === "mine") return;
    setLoading(true);
    setError(null);
    tasksApi
      .list(filter === "mine" ? address : undefined)
      .then(setTasks)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, address, isConnected]);

  if (!isConnected) {
    return (
      <div className="card placeholder col">
        <h3>Create your first task</h3>
        <p className="muted">
          Tasks are how you earn Task Credits and climb the leaderboard.
          Connect a wallet to begin.
        </p>
        <button className="btn primary" onClick={onConnect}>
          Connect Wallet
        </button>
      </div>
    );
  }

  return (
    <div className="tasks-page">
      <div className="page-toolbar">
        <div className="seg">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              className={"seg-btn " + (filter === f.id ? "active" : "")}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <button className="btn primary" onClick={() => setShowCreate(true)}>
          + New Task
        </button>
      </div>

      {error && <div className="alert error">{error}</div>}

      {loading && !tasks.length ? (
        <div className="card placeholder">Loading tasks…</div>
      ) : tasks.length === 0 ? (
        <div className="card placeholder col">
          <h3>No tasks yet</h3>
          <p className="muted">
            Click <strong>+ New Task</strong> to create your first one — you'll
            see live grading as you type.
          </p>
        </div>
      ) : (
        <div className="grid">
          {tasks.map((t) => (
            <TaskCard
              key={t.id}
              task={t}
              onSubmitClick={(task) => setActiveTask(task)}
            />
          ))}
        </div>
      )}

      {showCreate && (
        <CreateTaskModal
          address={address}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            reload();
            onActivity?.();
          }}
        />
      )}

      {activeTask && (
        <SubmitTaskProofModal
          task={activeTask}
          address={address}
          onClose={() => setActiveTask(null)}
          onDone={() => {
            onActivity?.();
          }}
        />
      )}
    </div>
  );
}
