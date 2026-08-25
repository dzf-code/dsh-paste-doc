window.__ModuleLoader__.load({
	id: "dsh-paste-doc",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		let React = require("react");
		// #region css
		const tagId = "dsh-paste-doc/PasteDocDock.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-paste-doc";
			tag.dataset.pluginCss = tagId;
			tag.textContent = ".dsh-pastedoc-dock{box-sizing:border-box;width:100%;max-width:var(--dsh-composer-card-max-width);margin:0 auto;flex-direction:column;gap:6px;display:flex}\n.dsh-pastedoc-card{background:var(--dsw-specific-tip);border:1px solid var(--dsw-alias-border-l1);border-radius:12px;overflow:hidden}\n.dsh-pastedoc-head{min-width:0;align-items:center;gap:8px;padding:6px 10px;display:flex}\n.dsh-pastedoc-title{color:var(--dsw-alias-label-primary);white-space:nowrap;text-overflow:ellipsis;flex:none;font-size:13px;font-weight:500;overflow:hidden}\n.dsh-pastedoc-preview{min-width:0;color:var(--dsw-alias-label-secondary);white-space:nowrap;text-overflow:ellipsis;flex:1;font-size:12px;overflow:hidden}\n.dsh-pastedoc-toggle{color:var(--dsw-alias-state-business-primary);cursor:pointer;background:0 0;border:none;border-radius:6px;flex:none;padding:2px 6px;font-size:12px}\n.dsh-pastedoc-toggle:hover{background:var(--dsw-alias-interactive-bg-hover)}\n.dsh-pastedoc-body{max-height:200px;margin:0;padding:2px 12px 10px;color:var(--dsw-alias-label-primary);white-space:pre-wrap;word-break:break-word;font:var(--dsw-font-xs-13);line-height:1.6;overflow:auto}\n.dsh-pastedoc-empty{display:none}\n[data-decoration=chip][data-paste-doc-chip]{background:transparent;box-sizing:border-box;border:1px solid var(--dsw-alias-border-l3);border-radius:999px;box-shadow:none}\n";
			document.head.appendChild(tag);
		}
		const CSS = {
			dock: "dsh-pastedoc-dock",
			card: "dsh-pastedoc-card",
			head: "dsh-pastedoc-head",
			title: "dsh-pastedoc-title",
			preview: "dsh-pastedoc-preview",
			toggle: "dsh-pastedoc-toggle",
			body: "dsh-pastedoc-body"
		};
		// #endregion
		// #region pasted-doc store (in-memory, per session)
		const SOURCE = "\u7C98\u8D34\u6587\u6863"; // must equal source.name below (serializer lookup key)
		const THRESHOLD = 200;
		let globalSeq = 0;
		/** Short preview of the first meaningful line (chip label budget ~14 chars). */
		function previewOf(text) {
			const lines = text.split(/\r?\n/);
			const first = (lines.find((l) => l.trim() !== "") ?? "").trim();
			if (first.length > 14) return first.slice(0, 14) + "\u2026";
			return first || text.slice(0, 14);
		}
		const stores = new Map();
		function makeStore() {
			const docs = [];
			const listeners = new Set();
			return {
				add(text) {
					globalSeq += 1;
					const id = "doc" + globalSeq;
					const lines = text.split(/\r?\n/);
					const first = lines.find((l) => l.trim() !== "");
					const title = (first ?? "").trim().slice(0, 40) || id;
					const doc = {
						id,
						name: id,
						title,
						text,
						length: text.length,
						label: "\uD83D\uDCC4 " + previewOf(text),
						clipboardText: "@" + id,
						createdAt: Date.now()
					};
					docs.push(doc);
					for (const fn of [...listeners]) fn();
					return doc;
				},
				list() { return docs.slice(); },
				get(id) { return docs.find((d) => d.id === id); },
				subscribe(fn) {
					listeners.add(fn);
					return () => { listeners.delete(fn); };
				}
			};
		}
		function storeOf(sessionId) {
			let store = stores.get(sessionId);
			if (store === void 0) {
				store = makeStore();
				stores.set(sessionId, store);
			}
			return store;
		}
		function addDoc(sessionId, text) { return storeOf(sessionId).add(text); }
		function listDocs(sessionId) { return storeOf(sessionId).list(); }
		function findDoc(ref) {
			for (const store of stores.values()) {
				const doc = store.get(ref);
				if (doc !== void 0) return doc;
			}
			return void 0;
		}
		function findDocByLabel(label) {
			for (const store of stores.values()) {
				const doc = store.list().find((d) => d.label === label);
				if (doc !== void 0) return doc;
			}
			return void 0;
		}
		function serializeDoc(doc) {
			return [
				"<\u5F15\u7528\u6587\u6863 id=\"" + doc.id + "\" \u6807\u9898=\"" + doc.title.replace(/[<>&"]/g, "") + "\" \u5B57\u6570=\"" + doc.length + "\">",
				"<\u5168\u6587>",
				doc.text,
				"</\u5168\u6587>",
				"</\u5F15\u7528\u6587\u6863>"
			].join("\n");
		}
		// #endregion
		// #region client plugin body
		/** Required services before apply runs. */
		const inject = ["slots", "sessions", "inputTriggers"];
		/**
		 * Client plugin body:
		 * 1. registers the "\u7C98\u8D34\u6587\u6863" @-source (manual insertion + plain-text @decoration);
		 * 2. mounts the dock above the composer showing the collapsible document cards;
		 * 3. the dock's capture-phase paste listener converts long pastes into citations.
		 */
		function apply(ctx) {
			const scopeFor = (sessionId) => ctx.sessions.scope(sessionId);
			const source = {
				trigger: "@",
				name: "\u7C98\u8D34\u6587\u6863",
				order: 100,
				candidates: (session, req) => {
					const docs = listDocs(session.sessionId);
					const q = req.query.toLowerCase();
					const items = q === "" ? docs : docs.filter((d) => d.name.includes(q) || d.title.toLowerCase().includes(q));
					return Promise.resolve(items.map((d) => ({ name: d.name, description: d.label, hint: d.title })));
				},
				onPick: (pick) => {
					const doc = findDoc(pick.candidate.name);
					if (doc === void 0) return void 0;
					return { insert: { source: SOURCE, ref: doc.id, label: doc.label, clipboardText: doc.clipboardText } };
				},
				lexicon: (session) => listDocs(session.sessionId).map((d) => d.name),
				subscribeLexicon: (session, cb) => storeOf(session.sessionId).subscribe(cb),
				codec: {
					clipboardText: (ref) => { const doc = findDoc(ref); return doc !== void 0 ? doc.clipboardText : "@" + ref; },
					serialize: (ref, signal) => {
						const doc = findDoc(ref);
						if (doc === void 0) return Promise.reject(new Error("\u7C98\u8D34\u6587\u6863\u300C" + ref + "\u300D\u4E0D\u5B58\u5728\u6216\u5DF2\u5931\u6548"));
						return Promise.resolve(serializeDoc(doc));
					}
				}
			};
			ctx.effect(() => ctx.inputTriggers.registerSource(source), "paste-doc: trigger source");
			/** Tag our chips (label starts with the doc emoji) so CSS can style only paste-doc chips.
			 * Deliberately SAFE: childList-only observer (no attribute observation) and a single
			 * idempotent dataset write — no title writes, so no feedback loop with React. */
			ctx.effect(() => {
				if (typeof MutationObserver === "undefined" || typeof document === "undefined") return;
				const root = document.body ?? document.documentElement;
				if (root === null || root === void 0) return;
				const tag = (span) => {
					try {
						if (span.dataset === void 0 || span.dataset.pasteDocChip !== void 0) return;
						const labelEl = span.firstElementChild;
						if (labelEl === null || typeof labelEl.textContent !== "string") return;
						if (!labelEl.textContent.startsWith("\uD83D\uDCC4 ")) return;
						span.dataset.pasteDocChip = "1";
					} catch (_) {}
				};
				const scan = (el) => {
					const found = el.querySelectorAll ? el.querySelectorAll("[data-decoration=chip]") : [];
					for (const chip of found) tag(chip);
				};
				const mo = new MutationObserver((muts) => {
					for (const m of muts) {
						if (m.type !== "childList") continue;
						for (const n of m.addedNodes) {
							if (n.nodeType !== 1 || !n.matches || typeof n.closest !== "function") continue;
							if (n.closest("[data-composer-card]") === null) continue; // only composer subtrees
							if (n.matches("[data-decoration=chip]")) tag(n);
							else if (n.querySelectorAll) scan(n);
						}
					}
				});
				scan(root);
				mo.observe(root, { childList: true, subtree: true });
				return () => mo.disconnect();
			}, "paste-doc: chip tagger");
			/**
			 * Dock component: mirrors the live input revision, subscribes to the
			 * session's pasted-doc store, intercepts long-text pastes (capture
			 * phase, before the composer's own handler) and turns them into
			 * reference chips via the scoped insert-reference event.
			 */
			const PasteDocDock = (props) => {
				const { useInput, inputActions, sessionId } = props;
				const revRef = React.useRef(0);
				const sidRef = React.useRef(sessionId);
				const actionsRef = React.useRef(inputActions);
				const phaseRef = React.useRef("plain");
				sidRef.current = sessionId;
				actionsRef.current = inputActions;
				revRef.current = useInput((s) => s.draftRev);
				phaseRef.current = useInput((s) => s.phase);
				// Live chip occurrences: the dock only shows docs still referenced
				// by a chip in the draft, so deleting a chip hides its card.
				const occurrences = useInput((s) => s.occurrences);
				const [docs, setDocs] = React.useState(() => listDocs(sessionId));
				const [expanded, setExpanded] = React.useState({});
				React.useEffect(() => {
					const store = storeOf(sessionId);
					return store.subscribe(() => setDocs(store.list()));
				}, [sessionId]);
				React.useEffect(() => {
					const onPaste = (e) => {
						try {
						const ta = e.target;
						if (!(ta instanceof HTMLTextAreaElement)) return;
						if (ta.closest("[data-composer-card]") === null) return;
						if (ta.readOnly || ta.disabled) return;
						if (e.ctrlKey && e.shiftKey) return; // Ctrl+Shift+V: raw paste
						const sid = sidRef.current;
						if (sid === void 0) return; // no live session (e.g. hero picker) — pass through
						// A live command/plan claim submits args WITHOUT expanding reference
						// chips, so a converted chip would lose the pasted text. Paste raw there.
						if (phaseRef.current === "claimed") return;
						const dt = e.clipboardData;
						if (dt === null) return;
						const hasFiles = Array.from(dt.items).some((it) => it.kind === "file");
						if (hasFiles) return;
						const text = dt.getData("text/plain").replace(/\uFFFC/g, "");
						const trimmed = text.trim();
						if (trimmed.length < THRESHOLD) return;
						e.preventDefault();
						e.stopImmediatePropagation();
						const start = ta.selectionStart ?? 0;
						const end = ta.selectionEnd ?? start;
						const doc = addDoc(sid, trimmed);
						const reference = { source: SOURCE, ref: doc.id, label: doc.label, clipboardText: doc.clipboardText };
						const span = { start, end, draftRev: revRef.current };
						const actx = scopeFor(sid);
						const ok = actx !== void 0 && actx.bail(actx, "slash/input-insert-reference", { reference, span }) === true;
						if (!ok) {
							// CAS/machine refused: fall back to a raw text insert.
							const next = ta.value.slice(0, start) + text + ta.value.slice(end);
							actionsRef.current?.setDraft(next);
							return;
						}
						const tail = ta.value.slice(end);
						const insertedLen = 1 + (tail === "" || tail[0] === " " ? 0 : 1);
						const caret = start + insertedLen;
						requestAnimationFrame(() => { try { ta.setSelectionRange(caret, caret); } catch (_) {} });
					} catch (err) {
						console.error("[paste-doc] paste interception error:", err);
					}
					};
					document.addEventListener("paste", onPaste, true);
					return () => document.removeEventListener("paste", onPaste, true);
				}, []);
				const live = new Set();
				for (const o of occurrences) if (o.source === SOURCE) live.add(o.ref);
				const visible = docs.filter((d) => live.has(d.id));
				if (visible.length === 0) return null;
				return React.createElement("div", { className: CSS.dock, "data-paste-doc-dock": true },
					visible.map((doc) => React.createElement("div", { key: doc.id, className: CSS.card },
						React.createElement("div", { className: CSS.head },
							React.createElement("span", { className: CSS.title }, doc.label),
							React.createElement("span", { className: CSS.preview }, expanded[doc.id] ? "\u5DF2\u5C55\u5F00 \u00B7 " + doc.length + "\u5B57" : doc.title),
							React.createElement("button", { type: "button", className: CSS.toggle, onClick: () => setExpanded((s) => ({ ...s, [doc.id]: !s[doc.id] })) },
								expanded[doc.id] ? "\u6536\u8D77" : "\u5C55\u5F00")
						),
						expanded[doc.id] ? React.createElement("pre", { className: CSS.body }, doc.text) : null
					))
				);
			};
			ctx.slots.inject("conversation.input.dock", () => ctx.slots.register({
				name: "conversation.input.dock",
				id: "paste-doc",
				order: 10,
				registrant: "dsh-paste-doc",
				inject: (sessionId) => ({ sessionId })
			}, PasteDocDock));
		}
		// #endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
