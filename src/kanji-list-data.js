async function fetchJSON(path) {
  const response = await fetch(path, { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw Error(`${path}: HTTP ${response.status}`);
  return response.json();
}

export async function loadKanjiIndex() {
  const index = await fetchJSON("/data/kanji-index.json");
  if (index.schema !== 1 || !/^[a-f0-9]{64}$/.test(index.version) ||
      !Array.isArray(index.rows) || !index.rows.length) throw Error("Invalid kanji index");
  const blockIds = new Map(index.rows.map(row => [row["한자"].trim(), row.detailBlock]));
  if (blockIds.size !== index.rows.length ||
      [...blockIds.values()].some(id => !Number.isSafeInteger(id) || id < 0)) throw Error("Invalid kanji detail mapping");
  const requests = new Map();
  const records = new Map();
  const contexts = new WeakMap();

  return {
    rows: index.rows,
    row: ch => records.get(ch),
    context: row => contexts.get(row),
    async detail(ch) {
      const id = blockIds.get(ch);
      if (id === undefined) return;
      if (records.has(ch)) return records.get(ch);
      if (!requests.has(id)) {
        const request = fetchJSON(`/data/kanji-detail/${index.version}/${id}.json`).then(block => {
          if (block.version !== index.version || !Array.isArray(block.rows) ||
              !block.media?.items || !block.ruby || !block.related) throw Error("Invalid kanji detail block");
          const expected = index.rows.filter(row => row.detailBlock === id).map(row => row["한자"].trim());
          if (block.rows.length !== expected.length ||
              block.rows.some((row, i) => row["한자"]?.trim() !== expected[i])) throw Error("Wrong kanji detail block");
          for (const row of block.rows) {
            records.set(row["한자"].trim(), row);
            contexts.set(row, block);
          }
        }).finally(() => requests.delete(id));
        requests.set(id, request);
      }
      await requests.get(id);
      return records.get(ch);
    },
  };
}
