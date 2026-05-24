var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => ZettelkastenPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");
var DEFAULT_SETTINGS = {
  fleetingFolder: "Zettelkasten/Fleeting",
  literatureFolder: "Zettelkasten/Literature",
  permanentFolder: "Zettelkasten/Permanent",
  idFormat: "YYYYMMDDHHmm",
  autoOpenNote: true,
  inboxTag: "inbox"
};
var INBOX_VIEW_TYPE = "zettelkasten-inbox";
var InboxView = class extends import_obsidian.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
  }
  getViewType() {
    return INBOX_VIEW_TYPE;
  }
  getDisplayText() {
    return "Zettelkasten Inbox";
  }
  getIcon() {
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
    const refreshBtn = header.createEl("button", { text: "\u21BB Refresh", cls: "zk-btn-secondary" });
    refreshBtn.addEventListener("click", () => this.render());
    const fleetingFiles = this.plugin.app.vault.getMarkdownFiles().filter(
      (f) => f.path.startsWith(this.plugin.settings.fleetingFolder + "/")
    );
    if (fleetingFiles.length === 0) {
      container.createEl("p", { text: "Inbox is empty \u2014 no fleeting notes to process.", cls: "zk-empty" });
      return;
    }
    const count = container.createEl("p", {
      text: `${fleetingFiles.length} note${fleetingFiles.length !== 1 ? "s" : ""} to process`,
      cls: "zk-count"
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
        text: (0, import_obsidian.moment)(file.stat.mtime).fromNow(),
        cls: "zk-inbox-date"
      });
      const actions = item.createEl("div", { cls: "zk-inbox-actions" });
      const promoteBtn = actions.createEl("button", { text: "\u2192 Permanent", cls: "zk-btn-primary" });
      promoteBtn.addEventListener("click", async () => {
        await this.plugin.promoteFleetingToPermanent(file);
        await this.render();
      });
      const litBtn = actions.createEl("button", { text: "\u2192 Literature", cls: "zk-btn-secondary" });
      litBtn.addEventListener("click", async () => {
        await this.plugin.promoteFleetingToLiterature(file);
        await this.render();
      });
    }
  }
};
var FleetingNoteModal = class extends import_obsidian.Modal {
  constructor(app, plugin, onSubmit) {
    super(app);
    this.plugin = plugin;
    this.onSubmit = onSubmit;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.addClass("zk-modal");
    contentEl.createEl("h2", { text: "New Fleeting Note" });
    contentEl.createEl("p", { text: "Capture a quick thought \u2014 refine it later.", cls: "zk-modal-hint" });
    let title = "";
    let content = "";
    new import_obsidian.Setting(contentEl).setName("Title").addText((text) => {
      text.setPlaceholder("What's the idea?").onChange((v) => title = v);
      text.inputEl.focus();
    });
    new import_obsidian.Setting(contentEl).setName("Note").addTextArea((area) => {
      area.setPlaceholder("Expand the thought...").onChange((v) => content = v);
      area.inputEl.rows = 5;
      area.inputEl.addClass("zk-textarea");
    });
    new import_obsidian.Setting(contentEl).addButton(
      (btn) => btn.setButtonText("Capture").setCta().onClick(() => {
        if (!title.trim()) {
          new import_obsidian.Notice("Title is required.");
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
};
var LiteratureNoteModal = class extends import_obsidian.Modal {
  constructor(app, plugin, onSubmit) {
    super(app);
    this.plugin = plugin;
    this.onSubmit = onSubmit;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.addClass("zk-modal");
    contentEl.createEl("h2", { text: "New Literature Note" });
    contentEl.createEl("p", { text: "Summarise a source in your own words.", cls: "zk-modal-hint" });
    const data = { title: "", author: "", source: "", year: "", summary: "", quotes: "" };
    new import_obsidian.Setting(contentEl).setName("Title / Topic").addText((t) => {
      t.setPlaceholder("e.g. How to Take Smart Notes").onChange((v) => data.title = v);
      t.inputEl.focus();
    });
    new import_obsidian.Setting(contentEl).setName("Author").addText((t) => t.setPlaceholder("e.g. S\xF6nke Ahrens").onChange((v) => data.author = v));
    new import_obsidian.Setting(contentEl).setName("Source URL or reference").addText((t) => t.setPlaceholder("URL, ISBN, or citation").onChange((v) => data.source = v));
    new import_obsidian.Setting(contentEl).setName("Year").addText((t) => t.setPlaceholder("e.g. 2017").onChange((v) => data.year = v));
    new import_obsidian.Setting(contentEl).setName("Summary (your words)").addTextArea((a) => {
      a.setPlaceholder("What's the key idea?").onChange((v) => data.summary = v);
      a.inputEl.rows = 4;
      a.inputEl.addClass("zk-textarea");
    });
    new import_obsidian.Setting(contentEl).setName("Quotes (optional)").addTextArea((a) => {
      a.setPlaceholder("Notable direct quotes...").onChange((v) => data.quotes = v);
      a.inputEl.rows = 3;
      a.inputEl.addClass("zk-textarea");
    });
    new import_obsidian.Setting(contentEl).addButton(
      (btn) => btn.setButtonText("Create Literature Note").setCta().onClick(() => {
        if (!data.title.trim()) {
          new import_obsidian.Notice("Title is required.");
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
};
var PermanentNoteModal = class extends import_obsidian.Modal {
  constructor(app, plugin, onSubmit) {
    super(app);
    this.plugin = plugin;
    this.onSubmit = onSubmit;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.addClass("zk-modal");
    contentEl.createEl("h2", { text: "New Permanent Note" });
    contentEl.createEl("p", { text: "One atomic idea, stated clearly.", cls: "zk-modal-hint" });
    const data = { title: "", idea: "", tags: "", links: "" };
    new import_obsidian.Setting(contentEl).setName("Title (the idea in a phrase)").addText((t) => {
      t.setPlaceholder("e.g. Writing to think clarifies reasoning").onChange((v) => data.title = v);
      t.inputEl.focus();
    });
    new import_obsidian.Setting(contentEl).setName("The idea (full sentence)").addTextArea((a) => {
      a.setPlaceholder("State the idea completely in your own words. One idea only.").onChange((v) => data.idea = v);
      a.inputEl.rows = 4;
      a.inputEl.addClass("zk-textarea");
    });
    new import_obsidian.Setting(contentEl).setName("Tags").addText((t) => t.setPlaceholder("e.g. writing, cognition, learning").onChange((v) => data.tags = v));
    new import_obsidian.Setting(contentEl).setName("Related notes (links)").addText((t) => t.setPlaceholder("e.g. [[202405241030]], [[Writing clears thinking]]").onChange((v) => data.links = v));
    new import_obsidian.Setting(contentEl).addButton(
      (btn) => btn.setButtonText("Create Permanent Note").setCta().onClick(() => {
        if (!data.title.trim()) {
          new import_obsidian.Notice("Title is required.");
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
};
var ZettelkastenPlugin = class extends import_obsidian.Plugin {
  async onload() {
    await this.loadSettings();
    this.registerView(INBOX_VIEW_TYPE, (leaf) => new InboxView(leaf, this));
    this.addCommand({
      id: "new-fleeting-note",
      name: "New fleeting note",
      callback: () => this.openFleetingNoteModal()
    });
    this.addCommand({
      id: "new-literature-note",
      name: "New literature note",
      callback: () => this.openLiteratureNoteModal()
    });
    this.addCommand({
      id: "new-permanent-note",
      name: "New permanent note",
      callback: () => this.openPermanentNoteModal()
    });
    this.addCommand({
      id: "open-inbox",
      name: "Open inbox",
      callback: () => this.openInboxView()
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
  zettelId() {
    return (0, import_obsidian.moment)().format(this.settings.idFormat);
  }
  async ensureFolder(path) {
    if (!await this.app.vault.adapter.exists(path)) {
      await this.app.vault.createFolder(path);
    }
  }
  async createFleetingNote(title, content) {
    await this.ensureFolder(this.settings.fleetingFolder);
    const id = this.zettelId();
    const filename = `${this.settings.fleetingFolder}/${id} ${title}.md`;
    const body = `---
id: ${id}
title: "${title}"
type: fleeting
created: ${(0, import_obsidian.moment)().format("YYYY-MM-DD HH:mm")}
tags:
  - ${this.settings.inboxTag}
---

${content}
`;
    const file = await this.app.vault.create(filename, body);
    if (this.settings.autoOpenNote)
      await this.app.workspace.openLinkText(file.path, "", false);
    new import_obsidian.Notice(`Fleeting note created: ${title}`);
    return file;
  }
  async createLiteratureNote(data) {
    await this.ensureFolder(this.settings.literatureFolder);
    const id = this.zettelId();
    const filename = `${this.settings.literatureFolder}/${id} ${data.title}.md`;
    const quotesSection = data.quotes.trim() ? `
## Quotes

${data.quotes.split("\n").filter((l) => l.trim()).map((l) => `> ${l}`).join("\n\n")}
` : "";
    const body = `---
id: ${id}
title: "${data.title}"
type: literature
author: "${data.author}"
source: "${data.source}"
year: "${data.year}"
created: ${(0, import_obsidian.moment)().format("YYYY-MM-DD HH:mm")}
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
    if (this.settings.autoOpenNote)
      await this.app.workspace.openLinkText(file.path, "", false);
    new import_obsidian.Notice(`Literature note created: ${data.title}`);
    return file;
  }
  async createPermanentNote(data) {
    await this.ensureFolder(this.settings.permanentFolder);
    const id = this.zettelId();
    const filename = `${this.settings.permanentFolder}/${id} ${data.title}.md`;
    const tags = data.tags.split(",").map((t) => `  - ${t.trim()}`).filter((t) => t.trim() !== "  -").join("\n");
    const links = data.links.trim() ? `
## Links

${data.links}
` : "";
    const body = `---
id: ${id}
title: "${data.title}"
type: permanent
created: ${(0, import_obsidian.moment)().format("YYYY-MM-DD HH:mm")}
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
    if (this.settings.autoOpenNote)
      await this.app.workspace.openLinkText(file.path, "", false);
    new import_obsidian.Notice(`Permanent note created: ${data.title}`);
    return file;
  }
  // ─── Promotion ──────────────────────────────────────────────────────────
  async promoteFleetingToPermanent(file) {
    const content = await this.app.vault.read(file);
    const titleMatch = file.basename.match(/^\d+ (.+)$/);
    const title = titleMatch ? titleMatch[1] : file.basename;
    const bodyLines = content.split("\n");
    const bodyStart = bodyLines.findIndex((l, i) => i > 0 && l === "---") + 1;
    const noteBody = bodyLines.slice(bodyStart).join("\n").trim();
    const data = {
      title,
      idea: noteBody,
      tags: "permanent",
      links: `[[${file.basename}]]`
    };
    await this.createPermanentNote(data);
    new import_obsidian.Notice(`Promoted "${title}" to permanent note.`);
  }
  async promoteFleetingToLiterature(file) {
    const titleMatch = file.basename.match(/^\d+ (.+)$/);
    const title = titleMatch ? titleMatch[1] : file.basename;
    const content = await this.app.vault.read(file);
    const bodyLines = content.split("\n");
    const bodyStart = bodyLines.findIndex((l, i) => i > 0 && l === "---") + 1;
    const noteBody = bodyLines.slice(bodyStart).join("\n").trim();
    const data = {
      title,
      author: "",
      source: "",
      year: "",
      summary: noteBody,
      quotes: ""
    };
    await this.createLiteratureNote(data);
    new import_obsidian.Notice(`Promoted "${title}" to literature note.`);
  }
  // ─── Inbox View ─────────────────────────────────────────────────────────
  async openInboxView() {
    const existing = this.app.workspace.getLeavesOfType(INBOX_VIEW_TYPE);
    if (existing.length) {
      this.app.workspace.revealLeaf(existing[0]);
      existing[0].view.render();
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
};
var ZettelkastenSettingTab = class extends import_obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Zettelkasten Core" });
    new import_obsidian.Setting(containerEl).setName("Fleeting notes folder").setDesc("Where quick captures land.").addText(
      (t) => t.setPlaceholder("Zettelkasten/Fleeting").setValue(this.plugin.settings.fleetingFolder).onChange(async (v) => {
        this.plugin.settings.fleetingFolder = v;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Literature notes folder").setDesc("Where source summaries live.").addText(
      (t) => t.setPlaceholder("Zettelkasten/Literature").setValue(this.plugin.settings.literatureFolder).onChange(async (v) => {
        this.plugin.settings.literatureFolder = v;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Permanent notes folder").setDesc("Where atomic ideas live.").addText(
      (t) => t.setPlaceholder("Zettelkasten/Permanent").setValue(this.plugin.settings.permanentFolder).onChange(async (v) => {
        this.plugin.settings.permanentFolder = v;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Zettel ID format").setDesc("Moment.js format for auto-generated IDs. Default: YYYYMMDDHHmm").addText(
      (t) => t.setPlaceholder("YYYYMMDDHHmm").setValue(this.plugin.settings.idFormat).onChange(async (v) => {
        this.plugin.settings.idFormat = v;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Auto-open new notes").setDesc("Open the note immediately after creating it.").addToggle(
      (t) => t.setValue(this.plugin.settings.autoOpenNote).onChange(async (v) => {
        this.plugin.settings.autoOpenNote = v;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Inbox tag").setDesc("Tag applied to fleeting notes (marks them as unprocessed).").addText(
      (t) => t.setPlaceholder("inbox").setValue(this.plugin.settings.inboxTag).onChange(async (v) => {
        this.plugin.settings.inboxTag = v;
        await this.plugin.saveSettings();
      })
    );
  }
};
