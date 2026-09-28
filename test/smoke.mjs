
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

// --- browser mocks ---
let pasteHandler = null;
const styleTags = [];
globalThis.window = globalThis;
globalThis.document = {
  head: { appendChild(tag) { styleTags.push(tag); } },
  querySelector() { return null; },
  createElement() { return { dataset: {}, textContent: "" }; },
  addEventListener(type, fn, capture) { if (type === "paste") pasteHandler = fn; },
  removeEventListener() {}
};

// react mock driven by a per-render context
let renderCtx = null;
const ReactMock = {
  useRef(init) { const r = { current: init }; renderCtx.refs.push(r); return r; },
  useState(init) {
    const idx = renderCtx.stateIdx++;
    if (idx === renderCtx.state.length) renderCtx.state.push(typeof init === "function" ? init() : init);
    return [renderCtx.state[idx], (next) => { renderCtx.state[idx] = typeof next === "function" ? next(renderCtx.state[idx]) : next; }];
  },
  useEffect(fn) { renderCtx.effects.push(fn); },
  createElement() { return {}; }
};

// --- load the real bundle ---
let surface = null;
window.__ModuleLoader__ = {
  load(entry) {
    const result = entry.factory((spec) => {
      if (spec === "react") return ReactMock;
      throw new Error("unexpected require: " + spec);
    });
    surface = result;
  }
};
const src = readFileSync(new URL("../lib/client.js", import.meta.url), "utf8");
new Function(src + "\n;return window.__ModuleLoader__;")();
assert.ok(surface, "bundle surface loaded");
assert.equal(typeof surface.apply, "function");
assert.deepEqual(surface.inject, ["slots", "sessions", "inputTriggers"]);
assert.equal(styleTags.length, 1, "css tag injected");

// --- apply with stub ctx ---
const bailCalls = [];
const actx = { bail(scope, event, payload) { bailCalls.push({ event, payload }); return true; } };
let registeredSource = null;
let dockEntry = null;
let dockFactory = null;
let setDraftCalls = [];
const ctx = {
  effect(fn) { const d = fn(); return typeof d === "function" ? d : () => {}; },
  inputTriggers: {
    registerSource(src) { registeredSource = src; return () => {}; }
  },
  slots: {
    inject(key, factory) { dockFactory = factory; return factory(); },
    register(opts, comp) { dockEntry = { opts, comp }; return () => {}; }
  },
  sessions: { scope() { return actx; } }
};
surface.apply(ctx);
assert.ok(registeredSource, "source registered");
assert.equal(registeredSource.trigger, "@");
assert.equal(registeredSource.name, "粘贴文档");
assert.ok(dockEntry && dockEntry.opts.id === "paste-doc");
assert.equal(typeof dockEntry.comp, "function");
assert.equal(typeof dockFactory, "function");

// --- render the dock component (manual render pass) ---
renderCtx = { refs: [], state: [], stateIdx: 0, effects: [] };
let liveOccurrences = [];
let livePhase = "plain";
const props = {
  useInput: (sel) => sel({ draftRev: 42, occurrences: liveOccurrences, phase: livePhase }),
  inputActions: { setDraft: (t) => setDraftCalls.push(t) },
  sessionId: "s1"
};
const vdom = dockEntry.comp(props);
assert.equal(vdom, null, "no occurrences → no dock cards");
for (const fn of renderCtx.effects) fn(); // run effects: store subscribe + paste listener
assert.equal(typeof pasteHandler, "function", "paste listener attached");

// --- simulate long-text paste ---
globalThis.requestAnimationFrame = (fn) => { fn(); return 0; };
globalThis.HTMLTextAreaElement = class HTMLTextAreaElement {};
const longText = "这是很长的一段文本。" + "x".repeat(300);
const ta = Object.assign(new HTMLTextAreaElement(), {
  value: "abcdef",
  selectionStart: 3,
  selectionEnd: 3,
  closest(sel) { return sel === "[data-composer-card]" ? {} : null; },
  setSelectionRange() {}
});
let prevented = false, stopped = false;
pasteHandler({
  target: ta,
  ctrlKey: false,
  shiftKey: false,
  clipboardData: { getData: () => longText, items: [] },
  preventDefault() { prevented = true; },
  stopImmediatePropagation() { stopped = true; }
});
assert.equal(prevented, true, "long paste intercepted");
assert.equal(stopped, true);
assert.equal(bailCalls.length, 1);
const call = bailCalls[0];
assert.equal(call.event, "slash/input-insert-reference");
assert.equal(call.payload.reference.source, registeredSource.name) // insert source must equal the source name (serializer lookup); // legacy id
assert.equal(call.payload.reference.source, registeredSource.name, "insert source must equal the source name (serializer lookup)");
assert.equal(call.payload.span.start, 3);
assert.equal(call.payload.span.end, 3);
assert.equal(call.payload.span.draftRev, 42);
const docId = call.payload.reference.ref;
assert.ok(docId.startsWith("doc"));
// chip label shows a text preview, not the internal id/count
assert.ok(call.payload.reference.label.startsWith("📄 "), "label starts with doc emoji");
assert.ok(call.payload.reference.label.includes("这是很长的一段文本"), "label carries the text preview");
assert.ok(!call.payload.reference.label.includes(docId), "label does not show the internal doc id");
assert.ok(!call.payload.reference.label.includes("字"), "label does not show char count");

// serialize → full citation block
const serialized = await registeredSource.codec.serialize(docId, new AbortController().signal);
assert.ok(serialized.includes("<引用文档"), "serialize has citation header");
assert.ok(serialized.includes(longText), "serialize carries full text");

// lexicon roll
assert.deepEqual(registeredSource.lexicon({ sessionId: "s1" }), [docId]);
// candidates
const cands = await registeredSource.candidates({ sessionId: "s1" }, { query: "", position: "leading", signal: null });
assert.equal(cands.length, 1);
assert.equal(cands[0].name, docId);
// onPick round-trips an insert outcome
const picked = registeredSource.onPick({ candidate: cands[0], session: { sessionId: "s1" }, position: "leading", via: "menu", span: { start: 0, end: 1, draftRev: 0 } });
assert.equal(picked.insert.ref, docId);

// --- dock follows live chip occurrences ---
// chip inserted (occurrence present) → card visible
liveOccurrences = [{ occurrenceId: 1, source: registeredSource.name, ref: docId, offset: 0, label: "x", clipboardText: "@" + docId }];
renderCtx = { refs: [], state: [], stateIdx: 0, effects: [] };
const vdomWithChip = dockEntry.comp(props);
assert.ok(vdomWithChip !== null, "chip present → card visible");
// chip deleted (occurrence gone) → card disappears
liveOccurrences = [];
renderCtx = { refs: [], state: [], stateIdx: 0, effects: [] };
const vdomAfterDelete = dockEntry.comp(props);
assert.equal(vdomAfterDelete, null, "chip deleted → card gone");

// --- escape hatch: ctrl+shift paste is NOT intercepted ---
bailCalls.length = 0; prevented = false;
pasteHandler({ target: ta, ctrlKey: true, shiftKey: true, clipboardData: { getData: () => longText, items: [] }, preventDefault() { prevented = true; }, stopImmediatePropagation() {} });
assert.equal(prevented, false, "ctrl+shift paste passes through");
assert.equal(bailCalls.length, 0);

// --- short paste passes through ---
pasteHandler({ target: ta, ctrlKey: false, shiftKey: false, clipboardData: { getData: () => "hi", items: [] }, preventDefault() { prevented = true; }, stopImmediatePropagation() {} });
assert.equal(prevented, false, "short paste passes through");
assert.equal(bailCalls.length, 0);

// --- claimed (command/plan claim) phase: paste raw, no chip conversion ---
renderCtx = { refs: [], state: [], stateIdx: 0, effects: [] };
livePhase = "claimed";
dockEntry.comp(props); // re-render so phaseRef.current = "claimed"
for (const fn of renderCtx.effects) fn();
prevented = false; bailCalls.length = 0;
pasteHandler({ target: ta, ctrlKey: false, shiftKey: false, clipboardData: { getData: () => longText, items: [] }, preventDefault() { prevented = true; }, stopImmediatePropagation() {} });
assert.equal(prevented, false, "claimed phase: paste passes through (not intercepted)");
assert.equal(bailCalls.length, 0, "claimed phase: no chip inserted");
livePhase = "plain"; // reset

// --- readonly textarea is never intercepted ---
const taRo = Object.assign(new HTMLTextAreaElement(), { value: "abc", selectionStart: 0, selectionEnd: 0, readOnly: true, disabled: false, closest: (sel) => sel === "[data-composer-card]" ? {} : null, setSelectionRange() {} });
prevented = false;
pasteHandler({ target: taRo, ctrlKey: false, shiftKey: false, clipboardData: { getData: () => longText, items: [] }, preventDefault() { prevented = true; }, stopImmediatePropagation() {} });
assert.equal(prevented, false, "readonly paste passes through");
assert.equal(bailCalls.length, 0);

// --- regression (dsh >= 0.1.5): Lexical contenteditable composer, no <textarea> ---
// Before the fix the handler started with `e.target instanceof HTMLTextAreaElement`,
// which is never true for the new Lexical editor → long paste was silently dropped
// (no error, no chip). This block drives the composer shape the new dsh actually has.
const shellPastes = [];
let bailResult = true;
const shell = {
  rev: 77,
  caretSpan() { return { start: 5, end: 9 }; },
  paste(text) { shellPastes.push(text); }
};
const scoped = {
  bail(scope, event, payload) { bailCalls.push({ event, payload }); return bailResult; },
  get(name) { return name === "conversation" ? { input: { for: () => shell } } : void 0; }
};
const ctx2 = {
  effect(fn) { const d = fn(); return typeof d === "function" ? d : () => {}; },
  get() { return void 0; },
  inputTriggers: { registerSource(src) { registeredSource = src; return () => {}; } },
  slots: {
    inject(key, factory) { dockFactory = factory; return factory(); },
    register(opts, comp) { dockEntry = { opts, comp }; return () => {}; }
  },
  sessions: { scope() { return scoped; } }
};
surface.apply(ctx2);
renderCtx = { refs: [], state: [], stateIdx: 0, effects: [] };
dockEntry.comp(props);
for (const fn of renderCtx.effects) fn(); // re-attach the paste listener for ctx2

const editorEl = {
  isContentEditable: true,
  getAttribute: (name) => (name === "contenteditable" ? "true" : null),
  closest(sel) {
    if (sel === "[data-composer-card]") return {};
    if (sel === "textarea, [contenteditable]") return editorEl;
    return null;
  }
};
bailCalls.length = 0;
prevented = false;
pasteHandler({
  target: editorEl,
  ctrlKey: false,
  shiftKey: false,
  clipboardData: { getData: () => longText, items: [] },
  preventDefault() { prevented = true; },
  stopImmediatePropagation() {}
});
assert.equal(prevented, true, "contenteditable composer: long paste is intercepted");
assert.equal(bailCalls.length, 1, "contenteditable composer: chip insert dispatched");
assert.equal(bailCalls[0].event, "slash/input-insert-reference");
assert.deepEqual(
  { start: bailCalls[0].payload.span.start, end: bailCalls[0].payload.span.end, draftRev: bailCalls[0].payload.span.draftRev },
  { start: 5, end: 9, draftRev: 77 },
  "contenteditable composer: span comes from shell caretSpan()/rev"
);
assert.equal(shellPastes.length, 0, "no raw-text fallback when the insert applied");

// --- regression: refused insert falls back to shell.paste(text) ---
bailResult = false;
bailCalls.length = 0;
prevented = false;
pasteHandler({
  target: editorEl,
  ctrlKey: false,
  shiftKey: false,
  clipboardData: { getData: () => longText, items: [] },
  preventDefault() { prevented = true; },
  stopImmediatePropagation() {}
});
assert.equal(prevented, true, "contenteditable composer: refused insert still swallows the default");
assert.equal(shellPastes.length, 1, "refused insert falls back to shell.paste(text)");
assert.equal(shellPastes[0], longText, "fallback pastes the original text");

// --- shell lookup prefers the by-id API (dsh >= 0.1.7 tightened for(actx)) ---
// `for(actx)` now throws unless the scope is a retained Session scope, while `shell(id)`
// needs only the session id — so the by-id lookup must be tried first.
const byIdCalls = [];
const byIdShell = {
  rev: 91,
  caretSpan() { return { start: 2, end: 4 }; },
  paste(text) { shellPastes.push(text); }
};
const scoped3 = {
  bail(scope, event, payload) { bailCalls.push({ event, payload }); return true; },
  get(name) {
    if (name !== "conversation") return void 0;
    return {
      input: {
        shell(id) { byIdCalls.push(id); return byIdShell; },
        for() { throw new Error("conversation.input.for requires a retained Session scope"); }
      }
    };
  }
};
const ctx3 = {
  effect(fn) { const d = fn(); return typeof d === "function" ? d : () => {}; },
  get() { return void 0; },
  inputTriggers: { registerSource(src) { registeredSource = src; return () => {}; } },
  slots: {
    inject(key, factory) { dockFactory = factory; return factory(); },
    register(opts, comp) { dockEntry = { opts, comp }; return () => {}; }
  },
  sessions: { scope() { return scoped3; } }
};
surface.apply(ctx3);
renderCtx = { refs: [], state: [], stateIdx: 0, effects: [] };
dockEntry.comp(props);
for (const fn of renderCtx.effects) fn();
bailCalls.length = 0;
prevented = false;
pasteHandler({
  target: editorEl,
  ctrlKey: false,
  shiftKey: false,
  clipboardData: { getData: () => longText, items: [] },
  preventDefault() { prevented = true; },
  stopImmediatePropagation() {}
});
assert.equal(byIdCalls.length, 1, "shell(id) is consulted first");
assert.equal(byIdCalls[0], "s1", "shell(id) receives the live session id");
assert.deepEqual(
  { start: bailCalls[0].payload.span.start, end: bailCalls[0].payload.span.end, draftRev: bailCalls[0].payload.span.draftRev },
  { start: 2, end: 4, draftRev: 91 },
  "the by-id shell drives the span even when for(actx) would throw"
);

// --- no shell + contenteditable (no DOM selection): pass through, never guess a span ---
const scoped4 = {
  bail() { throw new Error("bail must not be called without a resolvable span"); },
  get(name) { return name === "conversation" ? { input: {} } : void 0; }
};
const ctx4 = {
  effect(fn) { const d = fn(); return typeof d === "function" ? d : () => {}; },
  get() { return void 0; },
  inputTriggers: { registerSource(src) { registeredSource = src; return () => {}; } },
  slots: {
    inject(key, factory) { dockFactory = factory; return factory(); },
    register(opts, comp) { dockEntry = { opts, comp }; return () => {}; }
  },
  sessions: { scope() { return scoped4; } }
};
surface.apply(ctx4);
renderCtx = { refs: [], state: [], stateIdx: 0, effects: [] };
dockEntry.comp(props);
for (const fn of renderCtx.effects) fn();
prevented = false;
pasteHandler({
  target: editorEl,
  ctrlKey: false,
  shiftKey: false,
  clipboardData: { getData: () => longText, items: [] },
  preventDefault() { prevented = true; },
  stopImmediatePropagation() {}
});
assert.equal(prevented, false, "unresolvable span on contenteditable: paste passes through untouched");

// --- chip tagger covers both chip DOMs (legacy data-decoration + new Lexical title) ---
// The Lexical chip's class names are CSS-module hashes, so the label it exposes as `title`
// is the only stable hook; the legacy chip keeps its label as the first child instead.
const ownChip = { dataset: {}, title: "📄 这是很长的一段文本…", firstElementChild: { textContent: "@" }, querySelectorAll: () => [] };
const otherChip = { dataset: {}, title: "其他引用", firstElementChild: { textContent: "@" }, querySelectorAll: () => [] };
const legacyChip = { dataset: {}, firstElementChild: { textContent: "📄 旧版标签" }, querySelectorAll: () => [] };
let observerInstance = null;
globalThis.MutationObserver = class {
  constructor(cb) { this.cb = cb; }
  observe() { observerInstance = this; }
  disconnect() {}
};
document.body = {
  querySelectorAll: (sel) => (String(sel).includes('title^') ? [ownChip, otherChip, legacyChip] : []),
  closest: () => null
};
surface.apply(ctx2); // re-apply: the tagger effect scans document.body
assert.equal(ownChip.dataset.pasteDocChip, "1", "new Lexical chip tagged via its title");
assert.equal(legacyChip.dataset.pasteDocChip, "1", "legacy chip still tagged via its label child");
assert.equal(otherChip.dataset.pasteDocChip, void 0, "foreign chip is never tagged");
assert.ok(observerInstance !== null, "chip observer installed on document.body");

console.log("ALL SMOKE ASSERTIONS PASSED");
