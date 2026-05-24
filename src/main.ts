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

interface ZettelkastenSettings {
	fleetingFolder: string;
	literatureFolder: string;
	permanentFolder: string;
	idFormat: string;
	autoOpenNote: boolean;
	inboxTag: string;
}

const DEFAULT_SETTINGS: ZettelkastenSettings = {
	fleetingFolder: "Zettelkasten/Fleeting",
	literatureFolder: "Zettelkasten/Literature",
	permanentFolder: "Zettelkasten/Permanent",
	idFormat: "YYYYMMDDHHmm",
	autoOpenNote: true,
	inboxTag: "inbox",
};

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
			id: "open-inbox",
			name: "Open inbox",
			callback: () => this.openInboxView(),
		});

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

	zettelId(): string {
		return moment().format(this.settings.idFormat);
	}

	async ensureFolder(path: string) {
		if (!(await this.app.vault.adapter.exists(path))) {
			await this.app.vault.createFolder(path);
		}
	}

	async createFleetingNote(title: string, content: string): Promise<TFile> {
		await this.ensureFolder(this.settings.fleetingFolder);
		const id = this.zettelId();
		const filename = `${this.settings.fleetingFolder}/${id} ${title}.md`;
		const body = `---
id: ${id}
title: "${title}"
type: fleeting
created: ${moment().format("YYYY-MM-DD HH:mm")}
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

	async createLiteratureNote(data: LiteratureNoteData): Promise<TFile> {
		await this.ensureFolder(this.settings.literatureFolder);
		const id = this.zettelId();
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
author: "${data.author}"
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

	async createPermanentNote(data: PermanentNoteData): Promise<TFile> {
		await this.ensureFolder(this.settings.permanentFolder);
		const id = this.zettelId();
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
created: ${moment().format("YYYY-MM-DD HH:mm")}
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

	async promoteFleetingToPermanent(file: TFile) {
		const content = await this.app.vault.read(file);
		const titleMatch = file.basename.match(/^\d+ (.+)$/);
		const title = titleMatch ? titleMatch[1] : file.basename;

		const bodyLines = content.split("\n");
		const bodyStart = bodyLines.findIndex((l, i) => i > 0 && l === "---") + 1;
		const noteBody = bodyLines.slice(bodyStart).join("\n").trim();

		const data: PermanentNoteData = {
			title,
			idea: noteBody,
			tags: "permanent",
			links: `[[${file.basename}]]`,
		};

		await this.createPermanentNote(data);
		new Notice(`Promoted "${title}" to permanent note.`);
	}

	async promoteFleetingToLiterature(file: TFile) {
		const titleMatch = file.basename.match(/^\d+ (.+)$/);
		const title = titleMatch ? titleMatch[1] : file.basename;
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

		await this.createLiteratureNote(data);
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
			.setName("Zettel ID format")
			.setDesc("Moment.js format for auto-generated IDs. Default: YYYYMMDDHHmm")
			.addText((t) =>
				t
					.setPlaceholder("YYYYMMDDHHmm")
					.setValue(this.plugin.settings.idFormat)
					.onChange(async (v) => {
						this.plugin.settings.idFormat = v;
						await this.plugin.saveSettings();
					})
			);

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
