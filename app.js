const cards = [...document.querySelectorAll(".service-card")];
const refreshButton = document.querySelector("#refresh");
const statusNote = document.querySelector("#status-note");

async function checkService(card) {
  const badge = card.querySelector("[data-status]");
  badge.className = "status";
  badge.lastElementChild.textContent = "確認中";

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);

  try {
    // no-cors allows reachability checks when the target service does not enable CORS.
    await fetch(card.dataset.url, { mode: "no-cors", cache: "no-store", signal: controller.signal });
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

refreshButton.addEventListener("click", refreshStatuses);
refreshStatuses();
