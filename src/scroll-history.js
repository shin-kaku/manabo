export function isHistoryReturn() {
  const navigation = performance.getEntriesByType("navigation")[0];
  return navigation?.type === "back_forward" || navigation?.type === "reload";
}

export function trackHistoryScroll(save) {
  let timer;
  function cancel() {
    clearTimeout(timer);
  }
  function flush() {
    cancel();
    save();
  }
  window.addEventListener("scroll", () => {
    cancel();
    timer = setTimeout(flush, 150);
  }, { passive: true });
  document.addEventListener("scrollend", flush);
  window.addEventListener("pagehide", flush);
  return { flush, cancel };
}
