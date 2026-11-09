export function mnemonicComponents(raw) {
  const components = new Set();
  for (const match of String(raw ?? "").matchAll(/[（(]([^()（）]+)[）)]/g)) {
    for (const ch of match[1]) {
      if (/\p{Script=Han}/u.test(ch)) components.add(ch);
    }
  }
  return [...components];
}
