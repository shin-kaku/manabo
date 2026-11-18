// Installed in the page head so the first tap also works while the study modules load.
document.addEventListener("click", event => {
  const trigger = event.target.closest?.("[data-entry-zoom]");
  if (!trigger || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  if (typeof HTMLDialogElement === "undefined" || !HTMLDialogElement.prototype.showModal) return;
  event.preventDefault();

  const viewer = document.createElement("dialog");
  viewer.className = "entry-zoom-dialog";
  viewer.setAttribute("aria-label", trigger.getAttribute("aria-label"));
  const form = document.createElement("form");
  form.method = "dialog";
  const close = document.createElement("button");
  close.type = "submit";
  close.textContent = "닫기";
  form.append(close);
  const art = new Image();
  art.alt = trigger.querySelector("img").alt;
  art.src = trigger.href;
  viewer.append(form, art);
  document.body.append(viewer);
  viewer.addEventListener("click", event => {
    if (event.target === viewer) viewer.close();
  });
  viewer.addEventListener("close", () => {
    viewer.remove();
    trigger.focus({ preventScroll: true });
  }, { once: true });
  viewer.showModal();
  close.focus();
});
