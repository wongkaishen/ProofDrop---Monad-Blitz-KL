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
