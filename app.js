const cards = [...document.querySelectorAll(".service-card")];
const refreshButton = document.querySelector("#refresh");
const manageButton = document.querySelector("#manage");
const statusNote = document.querySelector("#status-note");
let controlToken = sessionStorage.getItem("localDeskControlToken");

async function checkService(card) {
  const badge = card.querySelector("[data-status]");
  badge.className = "status";
  badge.lastElementChild.textContent = "確認中";

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);

  try {
    await fetch(card.querySelector("[data-url]").dataset.url, {
      mode: "no-cors",
      cache: "no-store",
      signal: controller.signal,
    });
    badge.classList.add("online");
    badge.lastElementChild.textContent = "応答あり";
    return true;
  } catch {
    badge.classList.add("offline");
    badge.lastElementChild.textContent = "応答なし";
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function refreshStatuses() {
  refreshButton.disabled = true;
  statusNote.textContent = "各サービスの応答を確認しています。";
  const results = await Promise.all(cards.map(checkService));
  const online = results.filter(Boolean).length;
  statusNote.textContent = `${online} / ${cards.length} サービスが応答しています。`;
  refreshButton.disabled = false;
}

function showContainerControls(show) {
  for (const card of cards) {
    card.querySelector("[data-container-actions]").hidden = !show;
  }
  manageButton.textContent = show ? "操作をロック" : "コンテナ操作";
}

async function requestControl(path, method = "GET") {
  const response = await fetch(path, {
    method,
    headers: { Authorization: `Bearer ${controlToken}` },
  });
  if (response.status === 401) {
    controlToken = null;
    sessionStorage.removeItem("localDeskControlToken");
    showContainerControls(false);
    throw new Error("操作トークンが違います。もう一度入力してください。");
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Docker API に接続できません。");
  return result;
}

function renderContainerStatus(card, service) {
  const label = card.querySelector("[data-container-state]");
  const states = {
    running: "起動中",
    stopped: "停止中",
    partial: "一部起動",
    error: "状態不明",
  };
  label.className = `container-state ${service.state}`;
  label.textContent = service.error ? "状態取得エラー" : `${states[service.state] || "状態不明"} · ${service.running}/${service.total} コンテナ`;
}

async function refreshContainerStatuses() {
  if (!controlToken) return;
  try {
    const result = await requestControl("/api/services");
    for (const card of cards) {
      const service = result.services[card.dataset.serviceId];
      if (service) renderContainerStatus(card, service);
    }
  } catch (error) {
    statusNote.textContent = error.message;
  }
}

async function unlockControls() {
  const entered = window.prompt("起動スクリプトが作成した .control-token の内容を入力してください。");
  if (!entered) return;
  controlToken = entered.trim();
  try {
    await requestControl("/api/services");
    sessionStorage.setItem("localDeskControlToken", controlToken);
    showContainerControls(true);
    await refreshContainerStatuses();
  } catch (error) {
    controlToken = null;
    statusNote.textContent = error.message;
  }
}

async function runContainerAction(button) {
  const card = button.closest(".service-card");
  const action = button.dataset.action;
  if (action === "stop" && !window.confirm(`${card.querySelector(".service-name").textContent} を停止しますか？`)) return;

  const buttons = [...card.querySelectorAll("[data-action]")];
  buttons.forEach((item) => { item.disabled = true; });
  const state = card.querySelector("[data-container-state]");
  state.textContent = action === "start" ? "起動しています…" : "停止しています…";
  try {
    await requestControl(`/api/services/${card.dataset.serviceId}/${action}`, "POST");
    await refreshContainerStatuses();
    statusNote.textContent = `${card.querySelector(".service-name").textContent} を${action === "start" ? "起動" : "停止"}しました。`;
  } catch (error) {
    state.textContent = error.message;
  } finally {
    buttons.forEach((item) => { item.disabled = false; });
  }
}

manageButton.addEventListener("click", () => {
  if (controlToken) {
    controlToken = null;
    sessionStorage.removeItem("localDeskControlToken");
    showContainerControls(false);
    return;
  }
  unlockControls();
});

refreshButton.addEventListener("click", refreshStatuses);
for (const card of cards) {
  for (const button of card.querySelectorAll("[data-action]")) {
    button.addEventListener("click", () => runContainerAction(button));
  }
}

if (controlToken) {
  requestControl("/api/services")
    .then(() => { showContainerControls(true); return refreshContainerStatuses(); })
    .catch(() => { controlToken = null; sessionStorage.removeItem("localDeskControlToken"); });
}
refreshStatuses();
