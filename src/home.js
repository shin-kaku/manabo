// Keep existing bookmarks to a specific kanji or filtered study view working.
const params = new URLSearchParams(location.search);
if (location.hash.startsWith("#kanji=") || params.has("grade") || params.has("jlpt")) {
  location.replace(`/kanji/${location.search}${location.hash}`);
}
