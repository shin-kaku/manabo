// Window a fixed-aspect-ratio CSS grid. CSS remains the source of breakpoints.
export function createVirtualGrid({ element, createItem, removeItem, isActive, onScroll, onIdle }) {
  let items = [], geometry = null, frame = 0, idleTimer = 0, scrolling = false;
  const mounted = new Map();
  const overscan = 3;

  function measure() {
    const style = getComputedStyle(element);
    const columns = style.gridTemplateColumns.split(" ").filter(Boolean).length;
    const width = element.clientWidth;
    const columnGap = parseFloat(style.columnGap) || 0;
    const gap = parseFloat(style.rowGap) || 0;
    const cardWidth = (width - columnGap * (columns - 1)) / columns;
    return { columns, width, columnGap, gap, cardWidth, height: cardWidth * 1.5, stride: cardWidth * 1.5 + gap };
  }
  function gridTop() { return element.getBoundingClientRect().top + window.scrollY; }
  function settle() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      scrolling = false;
      render();
      if (isActive()) onIdle();
    }, 160);
  }
  function render() {
    frame = 0;
    if (!isActive() || !items.length || !element.clientWidth) return;
    const next = measure();
    const top = gridTop();
    const previous = geometry;
    geometry = next;
    const rows = Math.ceil(items.length / next.columns);
    element.style.height = `${rows * next.stride - next.gap}px`;
    // Keep the same leading item in view when rotating or crossing a breakpoint.
    if (previous && previous.width !== next.width && window.scrollY > top) {
      const position = (window.scrollY - top) / previous.stride;
      const index = Math.floor(position) * previous.columns;
      window.scrollTo({ top: top + (Math.floor(index / next.columns) + position % 1) * next.stride, behavior: "instant" });
    }
    const startRow = Math.max(0, Math.min(rows - 1, Math.floor((window.scrollY - top) / next.stride)) - overscan);
    const endRow = Math.min(rows, Math.max(startRow + 1, Math.ceil((window.scrollY + window.innerHeight - top) / next.stride)) + overscan);
    const wanted = new Set();
    for (let index = startRow * next.columns; index < Math.min(items.length, endRow * next.columns); index++) wanted.add(index);
    // Keep a keyboard-focused card alive until focus moves elsewhere.
    for (const [index, card] of mounted) if (card.contains(document.activeElement)) wanted.add(index);
    for (const [index, card] of mounted) {
      if (wanted.has(index)) continue;
      removeItem(card);
      card.remove();
      mounted.delete(index);
    }
    for (const index of [...wanted].sort((a, b) => a - b)) {
      let card = mounted.get(index);
      if (!card) {
        card = createItem(items[index]);
        card.dataset.index = index;
        card.setAttribute("role", "listitem");
        card.setAttribute("aria-posinset", index + 1);
        card.setAttribute("aria-setsize", items.length);
        mounted.set(index, card);
        // Preserve DOM/tab order without moving surviving (possibly focused) nodes.
        const following = [...element.children].find(node => Number(node.dataset.index) > index);
        element.insertBefore(card, following || null);
      }
      card.style.width = `${next.cardWidth}px`;
      card.style.height = `${next.height}px`;
      card.style.left = `${(index % next.columns) * (next.cardWidth + next.columnGap)}px`;
      card.style.top = `${Math.floor(index / next.columns) * next.stride}px`;
    }
  }
  function schedule() { if (!frame) frame = requestAnimationFrame(render); }
  function scrollToIndex(index) {
    render();
    if (!geometry || index < 0 || index >= items.length) return;
    const top = gridTop() + Math.floor(index / geometry.columns) * geometry.stride;
    window.scrollTo({ top: Math.max(0, top - (innerHeight - geometry.height) / 2), behavior: "instant" });
    render();
    settle();
  }
  window.addEventListener("scroll", () => {
    if (!isActive()) return;
    scrolling = true;
    onScroll();
    schedule();
    settle();
  }, { passive: true });
  window.addEventListener("resize", () => { schedule(); settle(); }, { passive: true });
  new ResizeObserver(() => { if (element.clientWidth !== geometry?.width) { schedule(); settle(); } }).observe(element);
  element.addEventListener("focusin", schedule);
  element.addEventListener("focusout", schedule);
  element.addEventListener("keydown", event => {
    if (event.key !== "Tab" || event.altKey || event.ctrlKey || event.metaKey || !isActive()) return;
    const card = event.target.closest(".card");
    if (!card) return;
    const focusables = node => [...node.querySelectorAll('button, a[href], input, select, textarea, [tabindex]')]
      .filter(control => control.tabIndex >= 0 && !control.disabled && !control.closest('[hidden], [inert]'));
    const controls = focusables(card);
    if (event.target !== (event.shiftKey ? controls[0] : controls.at(-1))) return;
    const index = Number(card.dataset.index) + (event.shiftKey ? -1 : 1);
    if (index < 0 || index >= items.length || mounted.has(index)) return;
    // Fast Tab presses can outrun the next animation frame. Materialize the
    // adjacent item synchronously instead of skipping to the page footer.
    event.preventDefault();
    scrollToIndex(index);
    const next = mounted.get(index);
    if (next) (event.shiftKey ? focusables(next).at(-1) : focusables(next)[0])?.focus({ preventScroll: true });
  });
  element.classList.add("virtual-grid");
  element.setAttribute("role", "list");
  element.setAttribute("aria-label", "한자 도감");

  return {
    get isScrolling() { return scrolling; },
    setItems(nextItems) {
      for (const card of mounted.values()) { removeItem(card); card.remove(); }
      mounted.clear();
      element.replaceChildren();
      items = nextItems;
      geometry = null;
      element.style.height = "";
      if (items.length) {
        const top = gridTop();
        if (window.scrollY > top) window.scrollTo({ top, behavior: "instant" });
        render();
      }
      settle();
    },
    refresh() { schedule(); settle(); },
    scrollToIndex,
  };
}
