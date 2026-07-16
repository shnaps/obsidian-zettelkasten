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
  idScheme: "timestamp",
  idFormat: "YYYYMMDDHHmm",
  rootIndexNote: "",
  autoOpenNote: true,
  inboxTag: "inbox"
};
var FOLGEZETTEL_RE = /^\d{1,4}(?:[a-z]+\d+)*[a-z]*$/i;
function isFolgezettelId(id) {
  return FOLGEZETTEL_RE.test(id);
}
function leadingId(basename) {
  const m = basename.match(/^(\S+)/);
  return m ? m[1] : null;
}
function splitFolgezettel(id) {
  var _a;
  return (_a = id.match(/\d+|[a-zA-Z]+/g)) != null ? _a : [];
}
function incrementLetters(s) {
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
function incrementSegment(seg) {
  return /\d/.test(seg) ? String(parseInt(seg, 10) + 1) : incrementLetters(seg);
}
function bumpLastSegment(id) {
  const tokens = splitFolgezettel(id);
  if (tokens.length === 0)
    return id;
  tokens[tokens.length - 1] = incrementSegment(tokens[tokens.length - 1]);
  return tokens.join("");
}
function firstChildId(parent) {
  var _a;
  const tokens = splitFolgezettel(parent);
  const last = (_a = tokens[tokens.length - 1]) != null ? _a : "";
  return parent + (/\d/.test(last) ? "a" : "1");
}
function parentFolgezettelId(id) {
  const tokens = splitFolgezettel(id);
  if (tokens.length <= 1)
    return null;
  return tokens.slice(0, -1).join("");
}
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
var FolgezettelNoteModal = class extends import_obsidian.Modal {
  constructor(app, plugin, refId, defaultMode, onSubmit) {
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
      text: "Branches land as fleeting notes \u2014 refine and promote them later. A child deepens the thread, a sibling continues it.",
      cls: "zk-modal-hint"
    });
    let title = "";
    let content = "";
    const refIsRoot = this.refId !== null && /^\d+$/.test(this.refId);
    let mode = this.refId ? this.defaultMode : "root";
    if (refIsRoot && mode === "sibling")
      mode = "root";
    new import_obsidian.Setting(contentEl).setName("Title").addText((t) => {
      t.setPlaceholder("The idea in a phrase").onChange((v) => title = v);
      t.inputEl.focus();
    });
    new import_obsidian.Setting(contentEl).setName("Note").addTextArea((a) => {
      a.setPlaceholder("Expand the thought...").onChange((v) => content = v);
      a.inputEl.rows = 5;
      a.inputEl.addClass("zk-textarea");
    });
    const preview = contentEl.createEl("p", { cls: "zk-modal-hint" });
    const updatePreview = () => {
      preview.setText(`Next ID: ${this.plugin.computeFolgezettelId(mode, this.refId)}`);
    };
    new import_obsidian.Setting(contentEl).setName("Position").setDesc(this.refId ? `Relative to ${this.refId}` : "No folgezettel note active \u2014 creates a new root thread.").addDropdown((d) => {
      if (this.refId) {
        d.addOption("child", "Child (deepen)");
        if (!refIsRoot)
          d.addOption("sibling", "Sibling (continue)");
      }
      d.addOption("root", "Root (new thread)");
      d.setValue(mode);
      d.onChange((v) => {
        mode = v;
        updatePreview();
      });
    });
    updatePreview();
    new import_obsidian.Setting(contentEl).addButton(
      (btn) => btn.setButtonText("Create Folgezettel Note").setCta().onClick(() => {
        if (!title.trim()) {
          new import_obsidian.Notice("Title is required.");
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
      id: "new-folgezettel-note",
      name: "New folgezettel note",
      callback: () => this.openFolgezettelNoteModal()
    });
    this.addCommand({
      id: "new-folgezettel-child",
      name: "New folgezettel child of current note",
      callback: () => this.quickFolgezettel("child")
    });
    this.addCommand({
      id: "new-folgezettel-sibling",
      name: "New folgezettel sibling of current note",
      callback: () => this.quickFolgezettel("sibling")
    });
    this.addCommand({
      id: "open-inbox",
      name: "Open inbox",
      callback: () => this.openInboxView()
    });
    this.addRibbonIcon(
      "git-branch",
      "New folgezettel note (branch from current)",
      () => this.openFolgezettelNoteModal()
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
  quickFolgezettel(mode) {
    const refId = this.activeFolgezettelId();
    if (!refId) {
      new import_obsidian.Notice("Active note has no folgezettel ID. Open a folgezettel note first.");
      return;
    }
    new FolgezettelNoteModal(this.app, this, refId, mode, async (title, content, chosenMode) => {
      await this.createFolgezettelNote(title, content, chosenMode, refId);
    }).open();
  }
  // Scheme-aware ID for the standard "new note" flows (root when folgezettel).
  zettelId() {
    if (this.settings.idScheme === "folgezettel") {
      return this.computeFolgezettelId("root", null);
    }
    return (0, import_obsidian.moment)().format(this.settings.idFormat);
  }
  // ─── Folgezettel ────────────────────────────────────────────────────────
  // Every folgezettel-shaped ID across all note folders (IDs are vault-global
  // because a note keeps its ID as it moves fleeting → literature → permanent).
  folgezettelIds() {
    const prefixes = [
      this.settings.fleetingFolder,
      this.settings.literatureFolder,
      this.settings.permanentFolder
    ].map((p) => p + "/");
    return this.app.vault.getMarkdownFiles().filter((f) => prefixes.some((p) => f.path.startsWith(p))).map((f) => leadingId(f.basename)).filter((id) => id !== null && isFolgezettelId(id));
  }
  // Locate the file for a given folgezettel ID (exact ID or "ID Title.md").
  folgezettelFileById(id) {
    var _a;
    return (_a = this.app.vault.getMarkdownFiles().find((f) => f.basename === id || f.basename.startsWith(id + " "))) != null ? _a : null;
  }
  // The folgezettel ID of the currently active note, or null.
  activeFolgezettelId() {
    const file = this.app.workspace.getActiveFile();
    if (!file)
      return null;
    const id = leadingId(file.basename);
    return id && isFolgezettelId(id) ? id : null;
  }
  // Compute the next free ID for a mode, avoiding collisions with existing notes.
  computeFolgezettelId(mode, refId) {
    const ids = new Set(this.folgezettelIds());
    if (mode === "root" || !refId) {
      const roots = [...ids].map((id) => splitFolgezettel(id)[0]).filter((t) => /^\d+$/.test(t)).map((t) => parseInt(t, 10));
      const next = roots.length ? Math.max(...roots) + 1 : 1;
      return String(next);
    }
    let candidate = mode === "child" ? firstChildId(refId) : bumpLastSegment(refId);
    while (ids.has(candidate))
      candidate = bumpLastSegment(candidate);
    return candidate;
  }
  // Branch: create a fleeting note carrying the computed folgezettel ID.
  // Luhmann flow — new branches start fleeting, get promoted later.
  async createFolgezettelNote(title, content, mode, refId) {
    const id = this.computeFolgezettelId(mode, refId);
    return this.createFleetingNote(title, content, id);
  }
  async ensureFolder(path) {
    if (!await this.app.vault.adapter.exists(path)) {
      await this.app.vault.createFolder(path);
    }
  }
  // Frontmatter "parent:" line for a folgezettel ID, or "" when none applies.
  parentFrontmatter(id) {
    if (this.settings.idScheme !== "folgezettel" || !isFolgezettelId(id))
      return "";
    const parentId = parentFolgezettelId(id);
    if (parentId) {
      const parentFile = this.folgezettelFileById(parentId);
      return `parent: "[[${parentFile ? parentFile.basename : parentId}]]"
`;
    }
    const idx = this.settings.rootIndexNote.trim().replace(/\.md$/, "");
    return idx ? `parent: "[[${idx}]]"
` : "";
  }
  async createFleetingNote(title, content, id) {
    await this.ensureFolder(this.settings.fleetingFolder);
    id = id != null ? id : this.zettelId();
    const filename = `${this.settings.fleetingFolder}/${id} ${title}.md`;
    const body = `---
id: ${id}
title: "${title}"
type: fleeting
${this.parentFrontmatter(id)}created: ${(0, import_obsidian.moment)().format("YYYY-MM-DD HH:mm")}
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
  async createLiteratureNote(data, id) {
    await this.ensureFolder(this.settings.literatureFolder);
    id = id != null ? id : this.zettelId();
    const filename = `${this.settings.literatureFolder}/${id} ${data.title}.md`;
    const quotesSection = data.quotes.trim() ? `
## Quotes

${data.quotes.split("\n").filter((l) => l.trim()).map((l) => `> ${l}`).join("\n\n")}
` : "";
    const body = `---
id: ${id}
title: "${data.title}"
type: literature
${this.parentFrontmatter(id)}author: "${data.author}"
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
  async createPermanentNote(data, id) {
    await this.ensureFolder(this.settings.permanentFolder);
    id = id != null ? id : this.zettelId();
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
${this.parentFrontmatter(id)}created: ${(0, import_obsidian.moment)().format("YYYY-MM-DD HH:mm")}
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
  // Split "1a My idea" → { id: "1a", title: "My idea" }. Falls back to the
  // whole basename as title when there's no leading ID token.
  splitBasename(basename) {
    const m = basename.match(/^(\S+)\s+(.+)$/);
    if (m)
      return { id: m[1], title: m[2] };
    return { id: null, title: basename };
  }
  // Keep the note's folgezettel ID as it graduates fleeting → permanent/literature.
  promotedId(basename) {
    if (this.settings.idScheme !== "folgezettel")
      return void 0;
    const { id } = this.splitBasename(basename);
    return id && isFolgezettelId(id) ? id : void 0;
  }
  async promoteFleetingToPermanent(file) {
    const content = await this.app.vault.read(file);
    const { title } = this.splitBasename(file.basename);
    const keepId = this.promotedId(file.basename);
    const bodyLines = content.split("\n");
    const bodyStart = bodyLines.findIndex((l, i) => i > 0 && l === "---") + 1;
    const noteBody = bodyLines.slice(bodyStart).join("\n").trim();
    const data = {
      title,
      idea: noteBody,
      tags: "permanent",
      links: ""
    };
    await this.createPermanentNote(data, keepId);
    await this.app.fileManager.trashFile(file);
    new import_obsidian.Notice(`Promoted "${title}" to permanent note.`);
  }
  async promoteFleetingToLiterature(file) {
    const { title } = this.splitBasename(file.basename);
    const keepId = this.promotedId(file.basename);
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
    await this.createLiteratureNote(data, keepId);
    await this.app.fileManager.trashFile(file);
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
    new import_obsidian.Setting(containerEl).setName("ID scheme").setDesc(
      "Timestamp: date-time IDs (YYYYMMDDHHmm). Folgezettel: Luhmann branching IDs (1, 1a, 1a1\u2026) shared across all note types. Child/sibling commands branch the active note into a fleeting note."
    ).addDropdown(
      (d) => d.addOption("timestamp", "Timestamp").addOption("folgezettel", "Folgezettel (branching)").setValue(this.plugin.settings.idScheme).onChange(async (v) => {
        this.plugin.settings.idScheme = v;
        await this.plugin.saveSettings();
        this.display();
      })
    );
    if (this.plugin.settings.idScheme === "timestamp") {
      new import_obsidian.Setting(containerEl).setName("Zettel ID format").setDesc("Moment.js format for timestamp IDs. Default: YYYYMMDDHHmm").addText(
        (t) => t.setPlaceholder("YYYYMMDDHHmm").setValue(this.plugin.settings.idFormat).onChange(async (v) => {
          this.plugin.settings.idFormat = v;
          await this.plugin.saveSettings();
        })
      );
    }
    if (this.plugin.settings.idScheme === "folgezettel") {
      new import_obsidian.Setting(containerEl).setName("Root index note").setDesc(
        "Optional. New root notes (1, 2, 3\u2026) get a parent link to this note so they aren't orphaned in the graph. Note name or path, e.g. Index or Zettelkasten/Index. Leave empty to disable."
      ).addText(
        (t) => t.setPlaceholder("Index").setValue(this.plugin.settings.rootIndexNote).onChange(async (v) => {
          this.plugin.settings.rootIndexNote = v;
          await this.plugin.saveSettings();
        })
      );
    }
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
