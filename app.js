const state = {
  categories: [],
  lastMemories: []
};

const runtimeConfig = window.AI_BRAIN_CONFIG || {};

const els = {
  apiBase: document.querySelector("#apiBase"),
  token: document.querySelector("#token"),
  status: document.querySelector("#status"),
  viewTitle: document.querySelector("#viewTitle"),
  output: document.querySelector("#output"),
  category: document.querySelector("#category"),
  projectSlug: document.querySelector("#projectSlug"),
  sourceApp: document.querySelector("#sourceApp"),
  tags: document.querySelector("#tags"),
  memoryText: document.querySelector("#memoryText"),
  allowRawStorage: document.querySelector("#allowRawStorage"),
  memorySearch: document.querySelector("#memorySearch"),
  memoryStatus: document.querySelector("#memoryStatus"),
  memoryList: document.querySelector("#memoryList"),
  contextProject: document.querySelector("#contextProject"),
  contextConsumer: document.querySelector("#contextConsumer"),
  contextOutput: document.querySelector("#contextOutput"),
  auditList: document.querySelector("#auditList")
};

function setStatus(message, tone = "") {
  els.status.textContent = message;
  els.status.className = `status ${tone}`.trim();
}

function isLocalPage() {
  return ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
}

function defaultApiBase() {
  if (isLocalPage()) {
    return runtimeConfig.localApiBase || "http://localhost:8800/api/v1";
  }
  return runtimeConfig.productionApiBase || "https://api.ourstuff.space/v1";
}

function initializeConnectionFields() {
  const params = new URLSearchParams(window.location.search);
  const apiFromUrl = params.get("api");
  els.apiBase.value = apiFromUrl || sessionStorage.getItem("aiBrainApiBase") || defaultApiBase();

  const tokenFromSession = sessionStorage.getItem("aiBrainToken");
  if (tokenFromSession) {
    els.token.value = tokenFromSession;
  } else if (isLocalPage() && runtimeConfig.localDevToken) {
    els.token.value = runtimeConfig.localDevToken;
  }
}

function apiBase() {
  return els.apiBase.value.replace(/\/$/, "");
}

function authHeaders() {
  sessionStorage.setItem("aiBrainApiBase", els.apiBase.value);
  if (els.token.value) {
    sessionStorage.setItem("aiBrainToken", els.token.value);
  } else {
    sessionStorage.removeItem("aiBrainToken");
  }

  return {
    Authorization: `Bearer ${els.token.value}`,
    "Content-Type": "application/json",
    "X-Brain-Consumer": "mort"
  };
}

async function api(path, options = {}) {
  const response = await fetch(`${apiBase()}${path}`, {
    ...options,
    headers: {
      ...authHeaders(),
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    const message = data?.error?.message || `Request failed with ${response.status}`;
    throw new Error(message);
  }
  return data;
}

function writeOutput(value) {
  els.output.textContent = JSON.stringify(value, null, 2);
}

function selectedConsumers() {
  return [...document.querySelectorAll('input[name="consumer"]:checked')].map((input) => input.value);
}

function tagsFromInput() {
  return els.tags.value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

async function loadCategories() {
  try {
    const data = await api("/categories");
    state.categories = data.categories;
    els.category.replaceChildren(
      ...data.categories.map((category) => {
        const option = document.createElement("option");
        option.value = category.label;
        option.textContent = category.label;
        return option;
      })
    );
  } catch (error) {
    setStatus(error.message, "bad");
  }
}

async function checkHealth() {
  try {
    const data = await api("/health", { method: "POST" });
    writeOutput(data);
    setStatus(`Health ok: ${data.store}`, "good");
  } catch (error) {
    setStatus(error.message, "bad");
  }
}

async function scrubMemory() {
  try {
    const data = await api("/scrub", {
      method: "POST",
      body: JSON.stringify({ text: els.memoryText.value })
    });
    writeOutput(data);
    setStatus(data.blocked ? "Blocked content detected" : "Scrub complete", data.blocked ? "bad" : "good");
  } catch (error) {
    setStatus(error.message, "bad");
  }
}

async function rememberMemory(event) {
  event.preventDefault();
  try {
    const data = await api("/remember", {
      method: "POST",
      body: JSON.stringify({
        projectSlug: els.projectSlug.value,
        sourceApp: els.sourceApp.value,
        text: els.memoryText.value,
        userSuggestedCategory: els.category.value,
        userSuggestedTags: tagsFromInput(),
        allowRawStorage: els.allowRawStorage.checked,
        allowedConsumers: selectedConsumers()
      })
    });
    writeOutput(data);
    setStatus(`Saved ${data.memoryId}`, "good");
    await loadMemories();
  } catch (error) {
    setStatus(error.message, "bad");
  }
}

function chip(text) {
  const span = document.createElement("span");
  span.className = "chip";
  span.textContent = text;
  return span;
}

function memoryItem(memory) {
  const item = document.createElement("article");
  item.className = "item";

  const head = document.createElement("div");
  head.className = "item-head";

  const title = document.createElement("div");
  const h3 = document.createElement("h3");
  h3.textContent = memory.title;
  const summary = document.createElement("p");
  summary.textContent = memory.summary;
  title.append(h3, summary);

  const status = document.createElement("span");
  status.className = "chip";
  status.textContent = memory.status;
  head.append(title, status);

  const chips = document.createElement("div");
  chips.className = "chips";
  [memory.categoryLabel, memory.sensitivity, ...memory.tags.slice(0, 6)].forEach((value) => chips.append(chip(value)));

  const actions = document.createElement("div");
  actions.className = "item-actions";
  [
    ["Approve", "approve"],
    ["Lock", "lock"],
    ["Archive", "archive"],
    ["Reject", "reject"],
    ["Delete", "delete"]
  ].forEach(([label, action]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.addEventListener("click", () => runMemoryAction(memory.id, action));
    actions.append(button);
  });

  item.append(head, chips, actions);
  return item;
}

async function loadMemories() {
  try {
    const params = new URLSearchParams();
    if (els.memorySearch.value) params.set("q", els.memorySearch.value);
    if (els.memoryStatus.value) params.set("status", els.memoryStatus.value);
    const data = await api(`/memories?${params.toString()}`);
    state.lastMemories = data.memories;
    els.memoryList.replaceChildren(...data.memories.map(memoryItem));
    setStatus(`${data.memories.length} memories`, "good");
  } catch (error) {
    setStatus(error.message, "bad");
  }
}

async function runMemoryAction(id, action) {
  try {
    const method = action === "delete" ? "DELETE" : "POST";
    const path = action === "delete" ? `/memories/${id}` : `/memories/${id}/${action}`;
    const data = await api(path, { method });
    writeOutput(data);
    setStatus(`${action} complete`, "good");
    await loadMemories();
  } catch (error) {
    setStatus(error.message, "bad");
  }
}

async function loadContext(rebuild = false) {
  try {
    const project = encodeURIComponent(els.contextProject.value);
    const consumer = encodeURIComponent(els.contextConsumer.value);
    const path = `/projects/${project}/context${rebuild ? "/rebuild" : ""}?consumer=${consumer}`;
    const data = await api(path, { method: rebuild ? "POST" : "GET" });
    els.contextOutput.textContent = JSON.stringify(data, null, 2);
    setStatus(rebuild ? "Context rebuilt" : "Context loaded", "good");
  } catch (error) {
    setStatus(error.message, "bad");
  }
}

function auditItem(event) {
  const item = document.createElement("article");
  item.className = "item";
  const head = document.createElement("div");
  head.className = "item-head";
  const title = document.createElement("div");
  const h3 = document.createElement("h3");
  h3.textContent = event.action;
  const summary = document.createElement("p");
  summary.textContent = `${event.targetType}${event.targetId ? `: ${event.targetId}` : ""}`;
  title.append(h3, summary);
  head.append(title, chip(new Date(event.createdAt).toLocaleString()));
  const details = document.createElement("pre");
  details.textContent = JSON.stringify(event.metadata, null, 2);
  item.append(head, details);
  return item;
}

async function loadAudit() {
  try {
    const data = await api("/audit");
    els.auditList.replaceChildren(...data.events.map(auditItem));
    setStatus(`${data.events.length} audit events`, "good");
  } catch (error) {
    setStatus(error.message, "bad");
  }
}

function activateView(view) {
  document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("is-active", tab.dataset.view === view));
  document.querySelectorAll(".view").forEach((panel) => panel.classList.toggle("is-active", panel.id === view));
  els.viewTitle.textContent =
    view === "capture" ? "Capture Memory" : view === "memories" ? "Memory Queue" : view === "context" ? "Project Context" : "Audit Trail";
}

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => activateView(tab.dataset.view));
});

document.querySelector("#healthBtn").addEventListener("click", checkHealth);
document.querySelector("#scrubBtn").addEventListener("click", scrubMemory);
document.querySelector("#rememberForm").addEventListener("submit", rememberMemory);
document.querySelector("#clearOutputBtn").addEventListener("click", () => writeOutput({}));
document.querySelector("#refreshMemoriesBtn").addEventListener("click", loadMemories);
document.querySelector("#loadContextBtn").addEventListener("click", () => loadContext(false));
document.querySelector("#rebuildContextBtn").addEventListener("click", () => loadContext(true));
document.querySelector("#loadAuditBtn").addEventListener("click", loadAudit);

initializeConnectionFields();
await loadCategories();
await checkHealth();
