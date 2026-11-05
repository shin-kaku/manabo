// No image requests on mount/overscan. Only visible, flipped cards opt in.
export function createCardImages({ isScrolling, concurrency = 2, cacheLimit = 4 }) {
  const records = new WeakMap(), pending = new Set(), active = new Set(), cache = new Map();
  const visible = img => {
    if (!img.isConnected || !img.closest(".card.flipped") || img.closest("[hidden]")) return false;
    const rect = img.getBoundingClientRect();
    return rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth;
  };
  function pump() {
    if (isScrolling()) return;
    for (const record of pending) {
      if (active.size >= concurrency) break;
      pending.delete(record);
      if (!visible(record.img) || record.status !== "idle") continue;
      record.status = "loading";
      active.add(record);
      record.img.src = record.urls[record.attempt];
    }
  }
  return {
    create(key, urls, onLoad, onUnavailable) {
      const img = cache.get(key) || document.createElement("img");
      cache.delete(key);
      const loaded = img.complete && img.naturalWidth > 0;
      const record = { key, urls, img, attempt: 0, status: loaded ? "loaded" : "idle" };
      records.set(img, record);
      img.decoding = "async";
      img.draggable = false;
      img.onload = () => {
        active.delete(record);
        record.status = "loaded";
        onLoad();
        pump();
      };
      img.onerror = () => {
        active.delete(record);
        if (!img.isConnected || record.status !== "loading") return;
        if (++record.attempt < urls.length) {
          record.status = "idle";
          pending.add(record);
        } else {
          record.status = "failed";
          onUnavailable();
        }
        pump();
      };
      if (loaded) onLoad();
      return img;
    },
    activate(img) {
      const record = records.get(img);
      if (record?.status === "idle" && visible(img)) pending.add(record);
      pump();
    },
    pause() {
      pending.clear();
      for (const record of active) {
        if (visible(record.img)) continue;
        record.status = "idle";
        record.img.removeAttribute("src");
        active.delete(record);
      }
    },
    release(img) {
      const record = records.get(img);
      if (!record) return;
      pending.delete(record);
      active.delete(record);
      img.onload = img.onerror = null;
      records.delete(img);
      img.remove();
      if (record.status === "loaded") {
        cache.delete(record.key);
        cache.set(record.key, img);
        while (cache.size > cacheLimit) {
          const key = cache.keys().next().value;
          cache.get(key).removeAttribute("src");
          cache.delete(key);
        }
      } else img.removeAttribute("src");
    },
  };
}
