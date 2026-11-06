export function driveFileId(source) {
  let url;
  try {
    url = new URL(source);
  } catch {
    return "";
  }
  if (!["http:", "https:"].includes(url.protocol) || url.hostname !== "drive.google.com") return "";

  const pathId = url.pathname.match(/^\/(?:file\/)?d\/([^/]+)(?:\/|$)/i)?.[1];
  let id = "";
  if (pathId) {
    try {
      id = decodeURIComponent(pathId);
    } catch {
      return "";
    }
  } else if (/^\/(?:uc|thumbnail|open)\/?$/i.test(url.pathname)) {
    id = url.searchParams.get("id") || "";
  }
  // Reject malformed encoding and non-file identifiers without breaking rendering.
  return /^[A-Za-z0-9_-]+$/.test(id) ? id : "";
}

export function imageCandidates(...sources) {
  const urls = [];
  for (const source of sources) {
    const value = String(source ?? "").trim();
    if (!value) continue;
    const id = driveFileId(value);
    if (id) {
      const encoded = encodeURIComponent(id);
      urls.push(`https://drive.google.com/thumbnail?id=${encoded}&sz=w1200`);
      urls.push(`https://lh3.googleusercontent.com/d/${encoded}=w1200`);
    } else {
      // Ordinary images and direct googleusercontent URLs retain their own URL.
      urls.push(value);
    }
  }
  return [...new Set(urls)];
}

// R contains the animation. Keep the previous Q diagram available if it cannot be loaded.
export function strokeSources(row) {
  const animation = row["움직이는 획순"]?.trim();
  const svg = row["획순 SVG"]?.trim();
  const diagram = row["획순 이미지"]?.trim();
  const sources = animation ? [animation, svg, diagram] : [svg || diagram];
  return [...new Set(sources.filter(Boolean))];
}
