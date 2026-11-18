const trigger = document.querySelector("[data-entry-zoom]");

if (trigger && typeof HTMLDialogElement !== "undefined" && HTMLDialogElement.prototype.showModal) {
  const viewer = document.createElement("dialog");
  viewer.className = "entry-zoom-dialog";
  viewer.setAttribute("aria-label", trigger.getAttribute("aria-label"));
  const form = document.createElement("form");
  form.method = "dialog";
  const close = document.createElement("button");
  close.type = "submit";
  close.textContent = "닫기";
  form.append(close);
  const art = document.createElement("img");
  art.alt = trigger.querySelector("img").alt;
  viewer.append(form, art);
  document.body.append(viewer);
  trigger.addEventListener("click", event => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    art.src = trigger.href;
    viewer.showModal();
    close.focus();
  });
  viewer.addEventListener("click", event => {
    if (event.target === viewer) viewer.close();
  });
  viewer.addEventListener("close", () => trigger.focus({ preventScroll: true }));
}
