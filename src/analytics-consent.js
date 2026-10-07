const storageKey = "manabo-analytics-consent-v1";
const maxAge = 180 * 24 * 60 * 60 * 1000;
let clarityStarted = false;

function readChoice() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (
      saved && ["granted", "denied"].includes(saved.choice) &&
      Number.isFinite(saved.at) && saved.at <= Date.now() &&
      Date.now() - saved.at < maxAge
    ) return saved.choice;
  } catch { /* Storage may be unavailable; ask again instead of assuming consent. */ }
  return null;
}

function saveChoice(choice) {
  try {
    localStorage.setItem(storageKey, JSON.stringify({ choice, at: Date.now() }));
  } catch { /* The choice still applies to this page when storage is blocked. */ }
}

function clearClarityCookies() {
  // Clear first-party cookies from earlier visits, including the old ungated tag.
  const parts = location.hostname.split(".");
  const domains = ["", ...parts.map((_, index) => `; domain=.${parts.slice(index).join(".")}`)];
  for (const name of ["_clck", "_clsk"]) {
    for (const domain of domains) {
      document.cookie = `${name}=; Max-Age=0; path=/${domain}; SameSite=Lax`;
    }
  }
}

function startClarity() {
  if (clarityStarted) return;
  clarityStarted = true;
  window.clarity("consentv2", { analytics_Storage: "granted", ad_Storage: "denied" });
  const script = document.createElement("script");
  script.async = true;
  script.src = "https://www.clarity.ms/tag/ytxd59p0il";
  document.head.append(script);
}

const banner = document.createElement("section");
banner.className = "analytics-banner";
banner.setAttribute("aria-label", "방문 분석 선택");
banner.innerHTML = `
  <div class="analytics-banner-copy">
    <strong>사이트 개선을 위한 방문 분석</strong>
    <p>동의하시면 Microsoft Clarity가 클릭·스크롤 등 이용 흐름을 분석합니다. 거부해도 학습 기능은 이용할 수 있습니다. <a href="/privacy-policy/#clarity">자세히 보기</a></p>
  </div>
  <div class="analytics-banner-actions">
    <button type="button" data-analytics-choice="denied">거부</button>
    <button type="button" data-analytics-choice="granted">동의</button>
  </div>`;
banner.hidden = true;
document.body.append(banner);

let choice = readChoice();
if (choice === "granted") startClarity();
else {
  clearClarityCookies();
  banner.hidden = choice === "denied";
}

let settingsTrigger = null;
document.querySelectorAll("[data-analytics-settings]").forEach((button) => {
  button.addEventListener("click", () => {
    settingsTrigger = button;
    banner.hidden = false;
    banner.querySelector("[data-analytics-choice]").focus();
  });
});
banner.querySelectorAll("[data-analytics-choice]").forEach((button) => {
  button.addEventListener("click", () => {
    choice = button.dataset.analyticsChoice;
    saveChoice(choice);
    banner.hidden = true;
    settingsTrigger?.focus();
    if (choice === "granted") startClarity();
    else {
      clearClarityCookies();
      if (clarityStarted) {
        window.clarity("consentv2", { analytics_Storage: "denied", ad_Storage: "denied" });
        // Unload the collector entirely so refusal also stops cookieless collection.
        location.reload();
      }
    }
  });
});

// Reconcile a preference changed in another tab without assuming consent.
window.addEventListener("storage", (event) => {
  if (event.key === storageKey || event.key === null) location.reload();
});
