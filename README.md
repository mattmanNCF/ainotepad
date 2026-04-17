# Notal

Write a note. AI organizes it. Your wiki grows automatically.

No prompts, no chatting. Every note is processed silently: tagged, annotated, and woven into a personal knowledge base. Built on Electron with local-first SQLite storage.

## Download

[Latest release →](https://github.com/mflma/ainotepad/releases/latest) — Windows installer (`.exe`) or portable zip.

## Quick start

1. Download and run the installer
2. Press `Ctrl+Shift+N` to capture a note from anywhere
3. Open **Settings** (gear icon, top right) to configure an AI provider
4. Write a note — AI processes it in the background

## Provider setup

**Ollama (free, local)** — install [Ollama](https://ollama.com), pull a model, select it in Settings.
```bash
ollama pull gemma4:e4b
```

**Claude** — get an API key from [console.anthropic.com](https://console.anthropic.com), paste into Settings.

**OpenAI** — get an API key from [platform.openai.com](https://platform.openai.com), paste into Settings.

Other supported providers: Gemini, OpenRouter, Groq, Hugging Face.

## MCP agent connection

Notal runs a local MCP server at `http://127.0.0.1:7723/mcp`.

Add to Claude Code or any MCP-compatible agent:
```json
{
  "mcpServers": {
    "notal": {
      "type": "http",
      "url": "http://127.0.0.1:7723/mcp"
    }
  }
}
```

Available tools:
- `get_recent_notes` — fetch notes ordered by date, newest first; filter by `since` timestamp
- `search_notes` — full-text search across all notes using SQLite FTS5
- `get_wiki_page` — read a KB wiki page by name (without `.md` extension)
- `list_wiki_pages` — list all wiki page filenames

## License

MIT — see [LICENSE](LICENSE). Source: [github.com/mflma/ainotepad](https://github.com/mflma/ainotepad).
