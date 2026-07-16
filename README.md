# Zettelkasten Core

A complete Zettelkasten second-brain system for Obsidian.

## Features

- **Fleeting notes** — quick capture modal, auto-tagged as inbox
- **Literature notes** — structured source summaries with author, year, quotes
- **Permanent notes** — atomic ideas with Zettel IDs, tags, and links
- **Folgezettel IDs** — optional Luhmann-style branching IDs (`1`, `1a`, `1a1`, `2`…) shared across every note type, with one-click child/sibling creation from the active note
- **Inbox view** — sidebar panel listing all unprocessed fleeting notes
- **Note promotion** — promote fleeting → permanent or → literature in one click (ID preserved)
- **Two ID schemes** — timestamp (configurable format) or folgezettel
- **Configurable folders** — set your own paths for each note type

## Usage

### Commands

| Command | Description |
|---|---|
| `New fleeting note` | Quick-capture a thought |
| `New literature note` | Summarise a source |
| `New permanent note` | Record an atomic idea |
| `New folgezettel note` | Create a branching note (root / child / sibling) |
| `New folgezettel child of current note` | Deepen the active note's thread |
| `New folgezettel sibling of current note` | Continue the active note's thread |
| `Open inbox` | Open the inbox sidebar |

### Folgezettel

Set **ID scheme → Folgezettel** in settings. Then every note gets a Luhmann
**branching ID** instead of a timestamp: numbers and letters alternate, so each
note tells you exactly where it sits in a thought sequence. The ID is not a
separate note type or folder — it's just the filename/ID your existing fleeting,
literature, and permanent notes use.

```
1        first thread
├─ 1a    child (deepens 1)
│  └─ 1a1   child (deepens 1a)
├─ 1b    sibling of 1a (continues the branch)
2        new root thread
```

- **Child** appends the next segment (`1` → `1a`, `1a` → `1a1`).
- **Sibling** increments the last segment (`1a` → `1b`, `1z` → `1aa`).
- IDs are collision-checked across all note folders, so branches never clash.
- Each note records a `parent` link in frontmatter to keep the branch navigable.

Following Luhmann's flow, **child / sibling branches are created as fleeting
notes** (title + note) — you refine them in the inbox and promote when ready.
Promotion keeps the same folgezettel ID, so a note's place in the tree is stable
from capture to permanent.

### Workflow (folgezettel)

1. `New fleeting note` → a new **root** ID, or run **child / sibling** on the
   open note to branch from where you are
2. Open the **Inbox** view to process fleeting notes
3. Promote each to a **permanent** or **literature** note — the ID carries over
   and the fleeting original moves to trash
4. Branch further from any note to keep growing the tree

## Folder Structure

```
Zettelkasten/
├── Fleeting/        ← quick captures (inbox) — new branches land here
├── Literature/      ← source summaries
└── Permanent/       ← atomic ideas
```

## Settings

- **Fleeting / Literature / Permanent folder** — configure paths
- **ID scheme** — `Timestamp` or `Folgezettel` (branching)
- **Zettel ID format** — moment.js format string for timestamp IDs (default: `YYYYMMDDHHmm`)
- **Auto-open new notes** — jump to note after creation
- **Inbox tag** — tag used to mark unprocessed fleeting notes

## Installation

Search for **Zettelkasten Core** in Settings → Community plugins → Browse.

## License

MIT
