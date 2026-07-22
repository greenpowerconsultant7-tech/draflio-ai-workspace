/// <reference types="node" />

import assert from "node:assert/strict";
import {
  deduplicateSuggestions,
  detectPageSuggestions,
  detectSensitiveRanges,
  isValidDateCandidate,
  isValidEmailCandidate,
  isValidIPv4,
  isValidLuhnCard,
  isValidPhoneCandidate,
  limitAcceptedSuggestions,
  textItemToNormalizedRectangle,
  type DetectionCategory,
  type DetectionOptions,
  type RedactionSuggestion,
} from "../src/features/redaction/redactionDetection.js";
import { clampNormalizedRectangle } from "../src/features/redaction/redactionGeometry.js";

const disabled: DetectionOptions = {
  email: false,
  phone: false,
  paymentCard: false,
  ipv4: false,
  date: false,
  customPhrase: "",
};
const ranges = (text: string, options: Partial<DetectionOptions>): DetectionCategory[] =>
  detectSensitiveRanges(text, { ...disabled, ...options }).map(({ category }) => category);

assert.equal(isValidEmailCandidate("person@example.com"), true);
assert.equal(isValidEmailCandidate("user+tag@sub.example.co.uk"), true);
assert.equal(isValidEmailCandidate("a..b@example.com"), false);
assert.deepEqual(ranges("person@example.com, user+tag@sub.example.co.uk.", { email: true }), [
  "email",
  "email",
]);
assert.deepEqual(ranges("prefix_person@example.com_suffix", { email: true }), []);

assert.equal(isValidPhoneCandidate("+1 (202) 555-0147"), true);
assert.equal(isValidPhoneCandidate("(202) 555-0147"), true);
assert.equal(isValidPhoneCandidate("12-34"), false);
assert.equal(isValidPhoneCandidate("+12 345 678 901 234 567"), false);
assert.equal(isValidPhoneCandidate("+1 -- 202-555-0147"), false);
assert.equal(isValidPhoneCandidate("4242 4242 4242 4242"), false);
assert.equal(isValidPhoneCandidate("192.168.1.25"), false);
assert.equal(isValidPhoneCandidate("22/07/2026"), false);

assert.equal(isValidLuhnCard("4222222222222"), true);
assert.equal(isValidLuhnCard("4242 4242 4242 4242"), true);
assert.equal(isValidLuhnCard("4242-4242-4242-4242"), true);
assert.equal(isValidLuhnCard("4000000000000000006"), true);
assert.equal(isValidLuhnCard("4242 4242 4242 4241"), false);
assert.equal(isValidLuhnCard("1111 1111 1111 1111"), false);
assert.equal(isValidLuhnCard("4242  4242 4242 4242"), false);
assert.equal(isValidLuhnCard("424242424242"), false);
assert.deepEqual(ranges("4242 4242 4242 4242", { paymentCard: true, phone: true }), [
  "payment-card",
]);

for (const address of ["0.0.0.0", "192.168.1.25", "255.255.255.255"])
  assert.equal(isValidIPv4(address), true);
for (const address of ["256.1.1.1", "1.2.3", "1.2.3.4.5", "1-2-3-4"])
  assert.equal(isValidIPv4(address), false);
assert.deepEqual(ranges("9.192.168.1.25 and 192.168.1.25.7", { ipv4: true }), []);

for (const date of [
  "2026-07-22",
  "22/07/2026",
  "07/22/2026",
  "22-07-2026",
  "07-22-2026",
  "July 22, 2026",
  "Feb 29 2024",
])
  assert.equal(isValidDateCandidate(date), true);
for (const date of ["2026-13-01", "2026-02-30", "Feb 29 2023", "31/04/2026"])
  assert.equal(isValidDateCandidate(date), false);
assert.deepEqual(ranges("On July 22, 2026, continue.", { date: true }), ["date"]);

const literal = ranges(" Project (Atlas) + Phase 1 and PROJECT (ATLAS) + PHASE 1 ", {
  customPhrase: "  Project (Atlas) + Phase 1  ",
});
assert.deepEqual(literal, ["custom", "custom"]);
assert.deepEqual(ranges("anything", { customPhrase: "   " }), []);
const metacharacters = ". * + ? ^ $ ( ) [ ] { } | \\";
assert.deepEqual(ranges(metacharacters, { customPhrase: metacharacters }), ["custom"]);

const clamped = clampNormalizedRectangle({ x: -0.1, y: 0.8, width: 0.4, height: 0.4 });
assert.ok(clamped);
assert.ok(clamped.x === 0 && clamped.y >= 0 && clamped.x + clamped.width <= 1);
assert.equal(clampNormalizedRectangle({ x: 0.2, y: 0.2, width: 0, height: 0.2 }), null);
assert.equal(clampNormalizedRectangle({ x: Number.NaN, y: 0, width: 1, height: 1 }), null);

const item = { str: "sample", transform: [12, 0, 0, 12, 100, 100], width: 60, height: 12 };
const viewports = [
  { width: 612, height: 792, scale: 1, transform: [1, 0, 0, -1, 0, 792] },
  { width: 792, height: 612, scale: 1, transform: [0, 1, 1, 0, 0, 0] },
  { width: 612, height: 792, scale: 1, transform: [-1, 0, 0, 1, 612, 0] },
  { width: 792, height: 612, scale: 1, transform: [0, -1, -1, 0, 792, 612] },
];
for (const viewport of viewports) {
  const rectangle = textItemToNormalizedRectangle(item, viewport, 0, 1, 0.01);
  assert.ok(rectangle);
  assert.ok([rectangle.x, rectangle.y, rectangle.width, rectangle.height].every(Number.isFinite));
  assert.ok(rectangle.x >= 0 && rectangle.y >= 0);
  assert.ok(rectangle.width > 0 && rectangle.height > 0);
  assert.ok(rectangle.x + rectangle.width <= 1 && rectangle.y + rectangle.height <= 1);
}
assert.equal(
  textItemToNormalizedRectangle({ ...item, transform: [Number.NaN, 0, 0, 1, 0, 0] }, viewports[0]),
  null,
);

const textItem = (str: string, x: number, y: number, width: number, hasEOL = false) => ({
  str,
  transform: [10, 0, 0, 10, x, y],
  width,
  height: 10,
  hasEOL,
});
const viewport = { width: 300, height: 200, scale: 1, transform: [1, 0, 0, -1, 0, 200] };
const fragmented = detectPageSuggestions(
  [textItem("user+", 10, 100, 30), textItem("tag@example.com", 40, 100, 90)],
  viewport,
  0,
  { ...disabled, email: true },
  0,
);
assert.equal(fragmented.suggestions.length, 1);
assert.ok(fragmented.suggestions[0].width > 0.3);
const separated = detectPageSuggestions(
  [textItem("first@example.com", 10, 100, 90), textItem("second@example.com", 140, 100, 100)],
  viewport,
  0,
  { ...disabled, email: true },
);
assert.equal(separated.suggestions.length, 2);
const acrossLines = detectPageSuggestions(
  [textItem("Project", 10, 100, 40, true), textItem("Atlas", 10, 70, 30)],
  viewport,
  0,
  { ...disabled, customPhrase: "Project Atlas" },
);
assert.equal(acrossLines.suggestions.length, 0);

const suggestion = (
  id: string,
  x: number,
  category: DetectionCategory = "email",
): RedactionSuggestion => ({
  id,
  category,
  selected: true,
  pageIndex: 0,
  x,
  y: 0.1,
  width: 0.2,
  height: 0.05,
});
assert.deepEqual(
  deduplicateSuggestions(
    [suggestion("one", 0.1), suggestion("duplicate", 0.1), suggestion("manual", 0.6)],
    [{ id: "existing", pageIndex: 0, x: 0.6, y: 0.1, width: 0.2, height: 0.05 }],
  ).map(({ id }) => id),
  ["one"],
);
assert.equal(
  deduplicateSuggestions([suggestion("email", 0.1), suggestion("phone", 0.1, "phone")], []).length,
  1,
);
assert.equal(
  deduplicateSuggestions([suggestion("accepted", 0.1)], [suggestion("old", 0.1)]).length,
  0,
);

const candidates = [suggestion("one", 0.1), suggestion("two", 0.4)];
assert.deepEqual(limitAcceptedSuggestions(0, candidates), {
  accepted: candidates,
  rejectedCount: 0,
});
assert.deepEqual(limitAcceptedSuggestions(99, candidates), {
  accepted: [candidates[0]],
  rejectedCount: 1,
});
assert.deepEqual(limitAcceptedSuggestions(100, candidates), { accepted: [], rejectedCount: 2 });
assert.deepEqual(limitAcceptedSuggestions(101, candidates), { accepted: [], rejectedCount: 2 });

const forbiddenKeys = new Set([
  "text",
  "value",
  "match",
  "matchedText",
  "rawText",
  "detectedText",
  "sensitiveText",
  "phrase",
  "cardNumber",
  "phoneNumber",
  "emailAddress",
]);
for (const result of [...fragmented.suggestions, ...separated.suggestions])
  assert.deepEqual(
    Object.keys(result).filter((key) => forbiddenKeys.has(key)),
    [],
  );

console.log(JSON.stringify({ test: "redaction-detection", result: "passed" }));
