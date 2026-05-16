const BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8000";

export async function fetchQuests() {
  const r = await fetch(`${BASE}/quests`);
  if (!r.ok) throw new Error(`GET /quests failed: ${r.status}`);
  return r.json();
}

export async function submitProof({ questId, address, text, image }) {
  const fd = new FormData();
  fd.append("questId", String(questId));
  fd.append("address", address);
  if (text) fd.append("text", text);
  if (image) fd.append("image", image);

  const r = await fetch(`${BASE}/submit`, { method: "POST", body: fd });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    throw new Error(data.detail || `submit failed: ${r.status}`);
  }
  return data;
}

export async function fetchHealth() {
  const r = await fetch(`${BASE}/health`);
  if (!r.ok) throw new Error(`GET /health failed: ${r.status}`);
  return r.json();
}

// ---- task / rewards / leaderboard ----

async function _json(method, path, body) {
  const init = { method, headers: {} };
  if (body !== undefined) {
    init.headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  const r = await fetch(`${BASE}${path}`, init);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.detail || `${method} ${path} failed: ${r.status}`);
  return data;
}

export const tasksApi = {
  grade: (payload) => _json("POST", "/tasks/grade", payload),
  create: (payload) => _json("POST", "/tasks", payload),
  list: (userAddress) =>
    _json(
      "GET",
      `/tasks${userAddress ? `?userAddress=${encodeURIComponent(userAddress)}` : ""}`
    ),
  get: (taskId) => _json("GET", `/tasks/${taskId}`),
  submitProof: async ({ taskId, userAddress, proofText, image }) => {
    const fd = new FormData();
    fd.append("user_address", userAddress);
    if (proofText) fd.append("proof_text", proofText);
    if (image) fd.append("image", image);
    const r = await fetch(`${BASE}/tasks/${taskId}/submit`, {
      method: "POST",
      body: fd,
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.detail || `submit failed: ${r.status}`);
    return data;
  },
};

export const rewardsApi = {
  get: (wallet) => _json("GET", `/users/${wallet}/rewards`),
  redeem: (wallet) => _json("POST", `/users/${wallet}/redeem`),
  dashboard: (wallet) => _json("GET", `/users/${wallet}/dashboard`),
};

export const leaderboardApi = {
  list: (limit = 25) => _json("GET", `/leaderboard?limit=${limit}`),
};
