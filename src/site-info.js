// Set VITE_CONTACT_EMAIL before building to publish the operator's contact address.
const email = (import.meta.env.VITE_CONTACT_EMAIL || "").trim();
if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  document.querySelectorAll("[data-contact-email]").forEach((container) => {
    const link = document.createElement("a");
    link.href = `mailto:${email}`;
    link.textContent = email;
    container.replaceChildren(link);
  });
}

document.querySelectorAll("[data-copyright-year]").forEach((element) => {
  const year = new Date().getFullYear();
  element.textContent = year > 2026 ? `2026–${year}` : "2026";
});

document.querySelectorAll(".site-info-menu").forEach((menu) => {
  document.addEventListener("click", (event) => {
    if (!menu.contains(event.target)) menu.open = false;
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && menu.open) {
      menu.open = false;
      menu.querySelector("summary").focus();
    }
  });
});
