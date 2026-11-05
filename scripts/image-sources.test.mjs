import test from "node:test";
import assert from "node:assert/strict";
import { imageCandidates } from "../src/image-sources.js";

const id = "abc_123-XYZ";
const candidates = [
  `https://drive.google.com/thumbnail?id=${id}&sz=w1200`,
  `https://lh3.googleusercontent.com/d/${id}=w1200`,
];

test("known Drive file, uc, thumbnail and open links use image endpoints", () => {
  for (const source of [
    `https://drive.google.com/file/d/${id}/view?usp=sharing`,
    `https://drive.google.com/d/${id}`,
    `https://drive.google.com/uc?export=view&id=${id}`,
    `https://drive.google.com/thumbnail?id=${id}&sz=w400`,
    `https://drive.google.com/open?id=${id}`,
    "https://drive.google.com/file/d/abc%5F123-XYZ/view",
  ]) assert.deepEqual(imageCandidates(source), candidates, source);
});

test("ordinary image URLs with id queries or d paths are not rewritten", () => {
  for (const source of [
    "https://images.example.com/picture?id=photo123&width=500",
    "https://images.example.com/d/photo123.png",
    "https://images.example.com/file/d/photo123/view",
    "https://drive.google.com.example.com/file/d/photo123/view",
    "https://drive.google.com@images.example.com/file/d/photo123/view",
    "/images/d/photo123.png?id=another",
  ]) assert.deepEqual(imageCandidates(source), [source], source);
});

test("direct googleusercontent URLs retain their original size and address", () => {
  const source = "https://lh3.googleusercontent.com/d/abc_123-XYZ=w800";
  assert.deepEqual(imageCandidates(source), [source]);
});

test("malformed encoded identifiers do not throw or become new Drive requests", () => {
  for (const source of [
    "https://drive.google.com/file/d/%E0%A4%A/view",
    "https://drive.google.com/open?id=%E0%A4%A",
    "https://drive.google.com/file/d/abc%2Fdef/view",
    "https://drive.google.com/uc?id=",
    "https://[invalid",
  ]) {
    assert.doesNotThrow(() => imageCandidates(source));
    assert.deepEqual(imageCandidates(source), [source]);
  }
});

test("empty inputs are skipped and candidates are deduplicated in order", () => {
  assert.deepEqual(imageCandidates(null, undefined, "", "  "), []);
  assert.deepEqual(imageCandidates(
    ` https://drive.google.com/file/d/${id}/view `,
    `https://drive.google.com/open?id=${id}`,
    candidates[1],
    "https://example.com/image.png",
    "https://example.com/image.png",
  ), [...candidates, "https://example.com/image.png"]);
});
