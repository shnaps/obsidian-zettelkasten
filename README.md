# Zettelkasten Core

A complete Zettelkasten second-brain system for Obsidian.

## Features

- **Fleeting notes** — quick capture modal, auto-tagged as inbox
- **Literature notes** — structured source summaries with author, year, quotes
- **Permanent notes** — atomic ideas with Zettel IDs, tags, and links
- **Inbox view** — sidebar panel listing all unprocessed fleeting notes
- **Note promotion** — promote fleeting → permanent or → literature in one click
- **Auto Zettel IDs** — timestamp-based IDs (configurable format)
- **Configurable folders** — set your own paths for each note type

## Usage

### Commands

| Command | Description |
|---|---|
| `New fleeting note` | Quick-capture a thought |
| `New literature note` | Summarise a source |
| `New permanent note` | Record an atomic idea |
| `Open inbox` | Open the inbox sidebar |

### Workflow

1. Capture fleeting notes throughout the day
2. Open the **Inbox** view to process them
3. Promote each to a **permanent note** (one atomic idea) or **literature note** (source summary)
4. Link permanent notes together to build your knowledge graph

## Folder Structure

```
Zettelkasten/
├── Fleeting/        ← quick captures (inbox)
├── Literature/      ← source summaries
└── Permanent/       ← atomic ideas
```

## Settings

- **Fleeting / Literature / Permanent folder** — configure paths
- **Zettel ID format** — moment.js format string (default: `YYYYMMDDHHmm`)
- **Auto-open new notes** — jump to note after creation
- **Inbox tag** — tag used to mark unprocessed fleeting notes

## Installation

Search for **Zettelkasten Core** in Settings → Community plugins → Browse.

## License

MIT
