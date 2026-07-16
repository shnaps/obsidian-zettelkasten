import {
	App,
	Modal,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
	TFile,
	moment,
	ItemView,
	WorkspaceLeaf,
	MarkdownView,
} from "obsidian";

// ─── Settings ────────────────────────────────────────────────────────────────

type IdScheme = "timestamp" | "folgezettel";

interface ZettelkastenSettings {
	fleetingFolder: string;
	literatureFolder: string;
	permanentFolder: string;
	idScheme: IdScheme;
	idFormat: string;
	rootIndexNote: string;
	autoOpenNote: boolean;
	inboxTag: string;
}

const DEFAULT_SETTINGS: ZettelkastenSettings = {
	fleetingFolder: "Zettelkasten/Fleeting",
	literatureFolder: "Zettelkasten/Literature",
	permanentFolder: "Zettelkasten/Permanent",
	idScheme: "timestamp",
	idFormat: "YYYYMMDDHHmm",
	rootIndexNote: "",
	autoOpenNote: true,
	inboxTag: "inbox",
};

// ─── Folgezettel ID Algebra ─────────────────────────────────────────────────
//
// Luhmann-style branching IDs alternate number / letter segments:
//   1 → child 1a → child 1a1 → child 1a1a …
//   sibling of 1a is 1b; sibling of 1 is 2.
// A note's children deepen the ID; its siblings increment the last segment.

// A folgezettel ID: short leading number, then alternating letter/number runs.
// Leading number capped at 4 digits so 12-digit timestamps never match.
const FOLGEZETTEL_RE = /^\d{1,4}(?:[a-z]+\d+)*[a-z]*$/i;

function isFolgezettelId(id: string): boolean {
	return FOLGEZETTEL_RE.test(id);
}

// The leading ID token of a note filename, or null. "1a2 Title" → "1a2".
function leadingId(basename: string): string | null {
	const m = basename.match(/^(\S+)/);
	return m ? m[1] : null;
}

// Split "1a2b" into ["1","a","2","b"].
function splitFolgezettel(id: string): string[] {
	return id.match(/\d+|[a-zA-Z]+/g) ?? [];
}

// Bijective base-26 letter increment: a→b, z→aa, az→ba.
function incrementLetters(s: string): string {
	const out = s.toLowerCase().split("");
	let i = out.length - 1;
	while (i >= 0) {
		if (out[i] === "z") {
			out[i] = "a";
			i--;
		} else {
			out[i] = String.fromCharCode(out[i].charCodeAt(0) + 1);
			return out.join("");
		}
	}
	return "a" + out.join("");
}

// Increment a single segment in place (digit → +1, letters → base-26).
function incrementSegment(seg: string): string {
	return /\d/.test(seg) ? String(parseInt(seg, 10) + 1) : incrementLetters(seg);
}

// Increment the last segment of an ID (the "next sibling" operation).
function bumpLastSegment(id: string): string {
	const tokens = splitFolgezettel(id);
	if (tokens.length === 0) return id;
	tokens[tokens.length - 1] = incrementSegment(tokens[tokens.length - 1]);
	return tokens.join("");
}

// First child of an ID: append "a" after a number, "1" after letters.
function firstChildId(parent: string): string {
	const tokens = splitFolgezettel(parent);
	const last = tokens[tokens.length - 1] ?? "";
	return parent + (/\d/.test(last) ? "a" : "1");
}

// Parent ID: drop the last segment. "1a2" → "1a", "1" → null (root has no parent).
function parentFolgezettelId(id: string): string | null {
	const tokens = splitFolgezettel(id);
	if (tokens.length <= 1) return null;
	return tokens.slice(0, -1).join("");
}

// ─── Inbox View ───────────────────────────────────────────────────────────────

const INBOX_VIEW_TYPE = "zettelkasten-inbox";

class InboxView extends ItemView {
	plugin: ZettelkastenPlugin;

	constructor(leaf: WorkspaceLeaf, plugin: ZettelkastenPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return INBOX_VIEW_TYPE;
	}

	getDisplayText(): string {
		return "Zettelkasten Inbox";
	}

	getIcon(): string {
		return "inbox";
	}

	async onOpen() {
		await this.render();
	}

	async render() {
		const container = this.containerEl.children[1];
		container.empty();
		container.addClass("zettelkasten-inbox");

		const header = container.createEl("div", { cls: "zk-inbox-header" });
		header.createEl("h2", { text: "Inbox" });
		const refreshBtn = header.createEl("button", { text: "↻ Refresh", cls: "zk-btn-secondary" });
		refreshBtn.addEventListener("click", () => this.render());

		const fleetingFiles = this.plugin.app.vault.getMarkdownFiles().filter((f) =>
			f.path.startsWith(this.plugin.settings.fleetingFolder + "/")
		);

		if (fleetingFiles.length === 0) {
			container.createEl("p", { text: "Inbox is empty — no fleeting notes to process.", cls: "zk-empty" });
			return;
		}

		const count = container.createEl("p", {
			text: `${fleetingFiles.length} note${fleetingFiles.length !== 1 ? "s" : ""} to process`,
			cls: "zk-count",
		});

		const list = container.createEl("div", { cls: "zk-inbox-list" });

		for (const file of fleetingFiles.sort((a, b) => b.stat.mtime - a.stat.mtime)) {
			const item = list.createEl("div", { cls: "zk-inbox-item" });

			const info = item.createEl("div", { cls: "zk-inbox-item-info" });
			const title = info.createEl("span", { text: file.basename, cls: "zk-inbox-title" });
			title.addEventListener("click", () => {
				this.plugin.app.workspace.openLinkText(file.path, "", false);
			});
			info.createEl("span", {
				text: moment(file.stat.mtime).fromNow(),
				cls: "zk-inbox-date",
			});

			const actions = item.createEl("div", { cls: "zk-inbox-actions" });

			const promoteBtn = actions.createEl("button", { text: "→ Permanent", cls: "zk-btn-primary" });
			promoteBtn.addEventListener("click", async () => {
				await this.plugin.promoteFleetingToPermanent(file);
				await this.render();
			});

			const litBtn = actions.createEl("button", { text: "→ Literature", cls: "zk-btn-secondary" });
			litBtn.addEventListener("click", async () => {
				await this.plugin.promoteFleetingToLiterature(file);
				await this.render();
			});
		}
	}
}

// ─── Modals ───────────────────────────────────────────────────────────────────

class FleetingNoteModal extends Modal {
	plugin: ZettelkastenPlugin;
	onSubmit: (title: string, content: string) => void;

	constructor(app: App, plugin: ZettelkastenPlugin, onSubmit: (title: string, content: string) => void) {
		super(app);
		this.plugin = plugin;
		this.onSubmit = onSubmit;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.addClass("zk-modal");
		contentEl.createEl("h2", { text: "New Fleeting Note" });
		contentEl.createEl("p", { text: "Capture a quick thought — refine it later.", cls: "zk-modal-hint" });

		let title = "";
		let content = "";

		new Setting(contentEl).setName("Title").addText((text) => {
			text.setPlaceholder("What's the idea?").onChange((v) => (title = v));
			text.inputEl.focus();
		});

		new Setting(contentEl).setName("Note").addTextArea((area) => {
			area.setPlaceholder("Expand the thought...").onChange((v) => (content = v));
			area.inputEl.rows = 5;
			area.inputEl.addClass("zk-textarea");
		});

		new Setting(contentEl).addButton((btn) =>
			btn
				.setButtonText("Capture")
				.setCta()
				.onClick(() => {
					if (!title.trim()) {
						new Notice("Title is required.");
						return;
					}
					this.onSubmit(title.trim(), content.trim());
					this.close();
				})
		);
	}

	onClose() {
		this.contentEl.empty();
	}
}

class LiteratureNoteModal extends Modal {
	plugin: ZettelkastenPlugin;
	onSubmit: (data: LiteratureNoteData) => void;

	constructor(app: App, plugin: ZettelkastenPlugin, onSubmit: (data: LiteratureNoteData) => void) {
		super(app);
		this.plugin = plugin;
		this.onSubmit = onSubmit;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.addClass("zk-modal");
		contentEl.createEl("h2", { text: "New Literature Note" });
		contentEl.createEl("p", { text: "Summarise a source in your own words.", cls: "zk-modal-hint" });

		const data: LiteratureNoteData = { title: "", author: "", source: "", year: "", summary: "", quotes: "" };

		new Setting(contentEl).setName("Title / Topic").addText((t) => {
			t.setPlaceholder("e.g. How to Take Smart Notes").onChange((v) => (data.title = v));
			t.inputEl.focus();
		});
		new Setting(contentEl).setName("Author").addText((t) => t.setPlaceholder("e.g. Sönke Ahrens").onChange((v) => (data.author = v)));
		new Setting(contentEl).setName("Source URL or reference").addText((t) => t.setPlaceholder("URL, ISBN, or citation").onChange((v) => (data.source = v)));
		new Setting(contentEl).setName("Year").addText((t) => t.setPlaceholder("e.g. 2017").onChange((v) => (data.year = v)));
		new Setting(contentEl).setName("Summary (your words)").addTextArea((a) => {
			a.setPlaceholder("What's the key idea?").onChange((v) => (data.summary = v));
			a.inputEl.rows = 4;
			a.inputEl.addClass("zk-textarea");
		});
		new Setting(contentEl).setName("Quotes (optional)").addTextArea((a) => {
			a.setPlaceholder("Notable direct quotes...").onChange((v) => (data.quotes = v));
			a.inputEl.rows = 3;
			a.inputEl.addClass("zk-textarea");
		});

		new Setting(contentEl).addButton((btn) =>
			btn
				.setButtonText("Create Literature Note")
				.setCta()
				.onClick(() => {
					if (!data.title.trim()) {
						new Notice("Title is required.");
						return;
					}
					this.onSubmit(data);
					this.close();
				})
		);
	}

	onClose() {
		this.contentEl.empty();
	}
}

class PermanentNoteModal extends Modal {
	plugin: ZettelkastenPlugin;
	onSubmit: (data: PermanentNoteData) => void;

	constructor(app: App, plugin: ZettelkastenPlugin, onSubmit: (data: PermanentNoteData) => void) {
		super(app);
		this.plugin = plugin;
		this.onSubmit = onSubmit;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.addClass("zk-modal");
		contentEl.createEl("h2", { text: "New Permanent Note" });
		contentEl.createEl("p", { text: "One atomic idea, stated clearly.", cls: "zk-modal-hint" });

		const data: PermanentNoteData = { title: "", idea: "", tags: "", links: "" };

		new Setting(contentEl).setName("Title (the idea in a phrase)").addText((t) => {
			t.setPlaceholder("e.g. Writing to think clarifies reasoning").onChange((v) => (data.title = v));
			t.inputEl.focus();
		});
		new Setting(contentEl).setName("The idea (full sentence)").addTextArea((a) => {
			a.setPlaceholder("State the idea completely in your own words. One idea only.").onChange((v) => (data.idea = v));
			a.inputEl.rows = 4;
			a.inputEl.addClass("zk-textarea");
		});
		new Setting(contentEl).setName("Tags").addText((t) => t.setPlaceholder("e.g. writing, cognition, learning").onChange((v) => (data.tags = v)));
		new Setting(contentEl).setName("Related notes (links)").addText((t) => t.setPlaceholder("e.g. [[202405241030]], [[Writing clears thinking]]").onChange((v) => (data.links = v)));

		new Setting(contentEl).addButton((btn) =>
			btn
				.setButtonText("Create Permanent Note")
				.setCta()
				.onClick(() => {
					if (!data.title.trim()) {
						new Notice("Title is required.");
						return;
					}
					this.onSubmit(data);
					this.close();
				})
		);
	}

	onClose() {
		this.contentEl.empty();
	}
}

type FolgezettelMode = "root" | "child" | "sibling";

class FolgezettelNoteModal extends Modal {
	plugin: ZettelkastenPlugin;
	refId: string | null;
	defaultMode: FolgezettelMode;
	onSubmit: (title: string, content: string, mode: FolgezettelMode) => void;

	constructor(
		app: App,
		plugin: ZettelkastenPlugin,
		refId: string | null,
		defaultMode: FolgezettelMode,
		onSubmit: (title: string, content: string, mode: FolgezettelMode) => void
	) {
		super(app);
		this.plugin = plugin;
		this.refId = refId;
		this.defaultMode = defaultMode;
		this.onSubmit = onSubmit;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.addClass("zk-modal");
		contentEl.createEl("h2", { text: "New Folgezettel Note" });
		contentEl.createEl("p", {
			text: "Branches land as fleeting notes — refine and promote them later. A child deepens the thread, a sibling continues it.",
			cls: "zk-modal-hint",
		});

		let title = "";
		let content = "";
		// Top-level notes are their own sibling sequence — for a root, "sibling"
		// and "root" coincide, so we drop sibling and fold it into root.
		const refIsRoot = this.refId !== null && /^\d+$/.test(this.refId);
		let mode: FolgezettelMode = this.refId ? this.defaultMode : "root";
		if (refIsRoot && mode === "sibling") mode = "root";

		new Setting(contentEl).setName("Title").addText((t) => {
			t.setPlaceholder("The idea in a phrase").onChange((v) => (title = v));
			t.inputEl.focus();
		});

		new Setting(contentEl).setName("Note").addTextArea((a) => {
			a.setPlaceholder("Expand the thought...").onChange((v) => (content = v));
			a.inputEl.rows = 5;
			a.inputEl.addClass("zk-textarea");
		});

		const preview = contentEl.createEl("p", { cls: "zk-modal-hint" });
		const updatePreview = () => {
			preview.setText(`Next ID: ${this.plugin.computeFolgezettelId(mode, this.refId)}`);
		};

		new Setting(contentEl)
			.setName("Position")
			.setDesc(this.refId ? `Relative to ${this.refId}` : "No folgezettel note active — creates a new root thread.")
			.addDropdown((d) => {
				if (this.refId) {
					d.addOption("child", "Child (deepen)");
					if (!refIsRoot) d.addOption("sibling", "Sibling (continue)");
				}
				d.addOption("root", "Root (new thread)");
				d.setValue(mode);
				d.onChange((v) => {
					mode = v as FolgezettelMode;
					updatePreview();
				});
			});

		updatePreview();

		new Setting(contentEl).addButton((btn) =>
			btn
				.setButtonText("Create Folgezettel Note")
				.setCta()
				.onClick(() => {
					if (!title.trim()) {
						new Notice("Title is required.");
						return;
					}
					this.onSubmit(title.trim(), content.trim(), mode);
					this.close();
				})
		);
	}

	onClose() {
		this.contentEl.empty();
	}
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface LiteratureNoteData {
	title: string;
	author: string;
	source: string;
	year: string;
	summary: string;
	quotes: string;
}

interface PermanentNoteData {
	title: string;
	idea: string;
	tags: string;
	links: string;
}

// ─── Plugin ───────────────────────────────────────────────────────────────────

export default class ZettelkastenPlugin extends Plugin {
	settings: ZettelkastenSettings;

	async onload() {
		await this.loadSettings();

		this.registerView(INBOX_VIEW_TYPE, (leaf) => new InboxView(leaf, this));

		this.addCommand({
			id: "new-fleeting-note",
			name: "New fleeting note",
			callback: () => this.openFleetingNoteModal(),
		});

		this.addCommand({
			id: "new-literature-note",
			name: "New literature note",
			callback: () => this.openLiteratureNoteModal(),
		});

		this.addCommand({
			id: "new-permanent-note",
			name: "New permanent note",
			callback: () => this.openPermanentNoteModal(),
		});

		this.addCommand({
			id: "new-folgezettel-note",
			name: "New folgezettel note",
			callback: () => this.openFolgezettelNoteModal(),
		});

		this.addCommand({
			id: "new-folgezettel-child",
			name: "New folgezettel child of current note",
			callback: () => this.quickFolgezettel("child"),
		});

		this.addCommand({
			id: "new-folgezettel-sibling",
			name: "New folgezettel sibling of current note",
			callback: () => this.quickFolgezettel("sibling"),
		});

		this.addCommand({
			id: "open-inbox",
			name: "Open inbox",
			callback: () => this.openInboxView(),
		});

		this.addRibbonIcon("git-branch", "New folgezettel note (branch from current)", () =>
			this.openFolgezettelNoteModal()
		);

		this.addRibbonIcon("inbox", "Zettelkasten Inbox", () => this.openInboxView());

		this.addSettingTab(new ZettelkastenSettingTab(this.app, this));
	}

	onunload() {
		this.app.workspace.detachLeavesOfType(INBOX_VIEW_TYPE);
	}

	// ─── Note Creation ──────────────────────────────────────────────────────

	openFleetingNoteModal() {
		new FleetingNoteModal(this.app, this, async (title, content) => {
			await this.createFleetingNote(title, content);
		}).open();
	}

	openLiteratureNoteModal() {
		new LiteratureNoteModal(this.app, this, async (data) => {
			await this.createLiteratureNote(data);
		}).open();
	}

	openPermanentNoteModal() {
		new PermanentNoteModal(this.app, this, async (data) => {
			await this.createPermanentNote(data);
		}).open();
	}

	openFolgezettelNoteModal() {
		const refId = this.activeFolgezettelId();
		new FolgezettelNoteModal(this.app, this, refId, refId ? "child" : "root", async (title, content, mode) => {
			await this.createFolgezettelNote(title, content, mode, refId);
		}).open();
	}

	// Command shortcut: open the modal preset to branch from the active note.
	quickFolgezettel(mode: FolgezettelMode) {
		const refId = this.activeFolgezettelId();
		if (!refId) {
			new Notice("Active note has no folgezettel ID. Open a folgezettel note first.");
			return;
		}
		new FolgezettelNoteModal(this.app, this, refId, mode, async (title, content, chosenMode) => {
			await this.createFolgezettelNote(title, content, chosenMode, refId);
		}).open();
	}

	// Scheme-aware ID for the standard "new note" flows (root when folgezettel).
	zettelId(): string {
		if (this.settings.idScheme === "folgezettel") {
			return this.computeFolgezettelId("root", null);
		}
		return moment().format(this.settings.idFormat);
	}

	// ─── Folgezettel ────────────────────────────────────────────────────────

	// Every folgezettel-shaped ID across all note folders (IDs are vault-global
	// because a note keeps its ID as it moves fleeting → literature → permanent).
	folgezettelIds(): string[] {
		const prefixes = [
			this.settings.fleetingFolder,
			this.settings.literatureFolder,
			this.settings.permanentFolder,
		].map((p) => p + "/");
		return this.app.vault
			.getMarkdownFiles()
			.filter((f) => prefixes.some((p) => f.path.startsWith(p)))
			.map((f) => leadingId(f.basename))
			.filter((id): id is string => id !== null && isFolgezettelId(id));
	}

	// Locate the file for a given folgezettel ID (exact ID or "ID Title.md").
	folgezettelFileById(id: string): TFile | null {
		return (
			this.app.vault.getMarkdownFiles().find((f) => f.basename === id || f.basename.startsWith(id + " ")) ?? null
		);
	}

	// The folgezettel ID of the currently active note, or null.
	activeFolgezettelId(): string | null {
		const file = this.app.workspace.getActiveFile();
		if (!file) return null;
		const id = leadingId(file.basename);
		return id && isFolgezettelId(id) ? id : null;
	}

	// Compute the next free ID for a mode, avoiding collisions with existing notes.
	computeFolgezettelId(mode: FolgezettelMode, refId: string | null): string {
		const ids = new Set(this.folgezettelIds());

		if (mode === "root" || !refId) {
			const roots = [...ids]
				.map((id) => splitFolgezettel(id)[0])
				.filter((t) => /^\d+$/.test(t))
				.map((t) => parseInt(t, 10));
			const next = roots.length ? Math.max(...roots) + 1 : 1;
			return String(next);
		}

		let candidate = mode === "child" ? firstChildId(refId) : bumpLastSegment(refId);
		while (ids.has(candidate)) candidate = bumpLastSegment(candidate);
		return candidate;
	}

	// Branch: create a fleeting note carrying the computed folgezettel ID.
	// Luhmann flow — new branches start fleeting, get promoted later.
	async createFolgezettelNote(
		title: string,
		content: string,
		mode: FolgezettelMode,
		refId: string | null
	): Promise<TFile> {
		const id = this.computeFolgezettelId(mode, refId);
		return this.createFleetingNote(title, content, id);
	}

	async ensureFolder(path: string) {
		if (!(await this.app.vault.adapter.exists(path))) {
			await this.app.vault.createFolder(path);
		}
	}

	// Frontmatter "parent:" line for a folgezettel ID, or "" when none applies.
	parentFrontmatter(id: string): string {
		if (this.settings.idScheme !== "folgezettel" || !isFolgezettelId(id)) return "";
		const parentId = parentFolgezettelId(id);
		if (parentId) {
			const parentFile = this.folgezettelFileById(parentId);
			return `parent: "[[${parentFile ? parentFile.basename : parentId}]]"\n`;
		}
		// Root note: optionally anchor it to a shared index / MOC so it isn't orphaned.
		const idx = this.settings.rootIndexNote.trim().replace(/\.md$/, "");
		return idx ? `parent: "[[${idx}]]"\n` : "";
	}

	async createFleetingNote(title: string, content: string, id?: string): Promise<TFile> {
		await this.ensureFolder(this.settings.fleetingFolder);
		id = id ?? this.zettelId();
		const filename = `${this.settings.fleetingFolder}/${id} ${title}.md`;
		const body = `---
id: ${id}
title: "${title}"
type: fleeting
${this.parentFrontmatter(id)}created: ${moment().format("YYYY-MM-DD HH:mm")}
tags:
  - ${this.settings.inboxTag}
---

${content}
`;
		const file = await this.app.vault.create(filename, body);
		if (this.settings.autoOpenNote) await this.app.workspace.openLinkText(file.path, "", false);
		new Notice(`Fleeting note created: ${title}`);
		return file;
	}

	async createLiteratureNote(data: LiteratureNoteData, id?: string): Promise<TFile> {
		await this.ensureFolder(this.settings.literatureFolder);
		id = id ?? this.zettelId();
		const filename = `${this.settings.literatureFolder}/${id} ${data.title}.md`;
		const quotesSection = data.quotes.trim()
			? `\n## Quotes\n\n${data.quotes
					.split("\n")
					.filter((l) => l.trim())
					.map((l) => `> ${l}`)
					.join("\n\n")}\n`
			: "";
		const body = `---
id: ${id}
title: "${data.title}"
type: literature
${this.parentFrontmatter(id)}author: "${data.author}"
source: "${data.source}"
year: "${data.year}"
created: ${moment().format("YYYY-MM-DD HH:mm")}
tags:
  - literature
---

## Summary

${data.summary}
${quotesSection}
## My Notes

_What does this mean for my thinking?_

`;
		const file = await this.app.vault.create(filename, body);
		if (this.settings.autoOpenNote) await this.app.workspace.openLinkText(file.path, "", false);
		new Notice(`Literature note created: ${data.title}`);
		return file;
	}

	async createPermanentNote(data: PermanentNoteData, id?: string): Promise<TFile> {
		await this.ensureFolder(this.settings.permanentFolder);
		id = id ?? this.zettelId();
		const filename = `${this.settings.permanentFolder}/${id} ${data.title}.md`;
		const tags = data.tags
			.split(",")
			.map((t) => `  - ${t.trim()}`)
			.filter((t) => t.trim() !== "  -")
			.join("\n");
		const links = data.links.trim() ? `\n## Links\n\n${data.links}\n` : "";
		const body = `---
id: ${id}
title: "${data.title}"
type: permanent
${this.parentFrontmatter(id)}created: ${moment().format("YYYY-MM-DD HH:mm")}
tags:
${tags || "  - permanent"}
---

## The Idea

${data.idea}
${links}
## Context & Evidence

_Where does this idea come from? What supports it?_

## Implications

_What does this change or open up?_
`;
		const file = await this.app.vault.create(filename, body);
		if (this.settings.autoOpenNote) await this.app.workspace.openLinkText(file.path, "", false);
		new Notice(`Permanent note created: ${data.title}`);
		return file;
	}

	// ─── Promotion ──────────────────────────────────────────────────────────

	// Split "1a My idea" → { id: "1a", title: "My idea" }. Falls back to the
	// whole basename as title when there's no leading ID token.
	splitBasename(basename: string): { id: string | null; title: string } {
		const m = basename.match(/^(\S+)\s+(.+)$/);
		if (m) return { id: m[1], title: m[2] };
		return { id: null, title: basename };
	}

	// Keep the note's folgezettel ID as it graduates fleeting → permanent/literature.
	promotedId(basename: string): string | undefined {
		if (this.settings.idScheme !== "folgezettel") return undefined;
		const { id } = this.splitBasename(basename);
		return id && isFolgezettelId(id) ? id : undefined;
	}

	async promoteFleetingToPermanent(file: TFile) {
		const content = await this.app.vault.read(file);
		const { title } = this.splitBasename(file.basename);
		const keepId = this.promotedId(file.basename);

		const bodyLines = content.split("\n");
		const bodyStart = bodyLines.findIndex((l, i) => i > 0 && l === "---") + 1;
		const noteBody = bodyLines.slice(bodyStart).join("\n").trim();

		const data: PermanentNoteData = {
			title,
			idea: noteBody,
			tags: "permanent",
			links: "",
		};

		await this.createPermanentNote(data, keepId);
		await this.app.fileManager.trashFile(file);
		new Notice(`Promoted "${title}" to permanent note.`);
	}

	async promoteFleetingToLiterature(file: TFile) {
		const { title } = this.splitBasename(file.basename);
		const keepId = this.promotedId(file.basename);
		const content = await this.app.vault.read(file);
		const bodyLines = content.split("\n");
		const bodyStart = bodyLines.findIndex((l, i) => i > 0 && l === "---") + 1;
		const noteBody = bodyLines.slice(bodyStart).join("\n").trim();

		const data: LiteratureNoteData = {
			title,
			author: "",
			source: "",
			year: "",
			summary: noteBody,
			quotes: "",
		};

		await this.createLiteratureNote(data, keepId);
		await this.app.fileManager.trashFile(file);
		new Notice(`Promoted "${title}" to literature note.`);
	}

	// ─── Inbox View ─────────────────────────────────────────────────────────

	async openInboxView() {
		const existing = this.app.workspace.getLeavesOfType(INBOX_VIEW_TYPE);
		if (existing.length) {
			this.app.workspace.revealLeaf(existing[0]);
			(existing[0].view as InboxView).render();
			return;
		}
		const leaf = this.app.workspace.getRightLeaf(false);
		if (leaf) {
			await leaf.setViewState({ type: INBOX_VIEW_TYPE, active: true });
			this.app.workspace.revealLeaf(leaf);
		}
	}

	// ─── Settings ───────────────────────────────────────────────────────────

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

// ─── Settings Tab ─────────────────────────────────────────────────────────────

class ZettelkastenSettingTab extends PluginSettingTab {
	plugin: ZettelkastenPlugin;

	constructor(app: App, plugin: ZettelkastenPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display() {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.createEl("h2", { text: "Zettelkasten Core" });

		new Setting(containerEl)
			.setName("Fleeting notes folder")
			.setDesc("Where quick captures land.")
			.addText((t) =>
				t
					.setPlaceholder("Zettelkasten/Fleeting")
					.setValue(this.plugin.settings.fleetingFolder)
					.onChange(async (v) => {
						this.plugin.settings.fleetingFolder = v;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Literature notes folder")
			.setDesc("Where source summaries live.")
			.addText((t) =>
				t
					.setPlaceholder("Zettelkasten/Literature")
					.setValue(this.plugin.settings.literatureFolder)
					.onChange(async (v) => {
						this.plugin.settings.literatureFolder = v;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Permanent notes folder")
			.setDesc("Where atomic ideas live.")
			.addText((t) =>
				t
					.setPlaceholder("Zettelkasten/Permanent")
					.setValue(this.plugin.settings.permanentFolder)
					.onChange(async (v) => {
						this.plugin.settings.permanentFolder = v;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("ID scheme")
			.setDesc(
				"Timestamp: date-time IDs (YYYYMMDDHHmm). Folgezettel: Luhmann branching IDs (1, 1a, 1a1…) shared across all note types. Child/sibling commands branch the active note into a fleeting note."
			)
			.addDropdown((d) =>
				d
					.addOption("timestamp", "Timestamp")
					.addOption("folgezettel", "Folgezettel (branching)")
					.setValue(this.plugin.settings.idScheme)
					.onChange(async (v) => {
						this.plugin.settings.idScheme = v as IdScheme;
						await this.plugin.saveSettings();
						this.display();
					})
			);

		if (this.plugin.settings.idScheme === "timestamp") {
			new Setting(containerEl)
				.setName("Zettel ID format")
				.setDesc("Moment.js format for timestamp IDs. Default: YYYYMMDDHHmm")
				.addText((t) =>
					t
						.setPlaceholder("YYYYMMDDHHmm")
						.setValue(this.plugin.settings.idFormat)
						.onChange(async (v) => {
							this.plugin.settings.idFormat = v;
							await this.plugin.saveSettings();
						})
				);
		}

		if (this.plugin.settings.idScheme === "folgezettel") {
			new Setting(containerEl)
				.setName("Root index note")
				.setDesc(
					"Optional. New root notes (1, 2, 3…) get a parent link to this note so they aren't orphaned in the graph. Note name or path, e.g. Index or Zettelkasten/Index. Leave empty to disable."
				)
				.addText((t) =>
					t
						.setPlaceholder("Index")
						.setValue(this.plugin.settings.rootIndexNote)
						.onChange(async (v) => {
							this.plugin.settings.rootIndexNote = v;
							await this.plugin.saveSettings();
						})
				);
		}

		new Setting(containerEl)
			.setName("Auto-open new notes")
			.setDesc("Open the note immediately after creating it.")
			.addToggle((t) =>
				t.setValue(this.plugin.settings.autoOpenNote).onChange(async (v) => {
					this.plugin.settings.autoOpenNote = v;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName("Inbox tag")
			.setDesc("Tag applied to fleeting notes (marks them as unprocessed).")
			.addText((t) =>
				t
					.setPlaceholder("inbox")
					.setValue(this.plugin.settings.inboxTag)
					.onChange(async (v) => {
						this.plugin.settings.inboxTag = v;
						await this.plugin.saveSettings();
					})
			);
	}
}
