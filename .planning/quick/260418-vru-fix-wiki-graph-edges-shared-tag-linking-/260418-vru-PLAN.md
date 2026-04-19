---
phase: quick-260418-vru
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/renderer/src/components/WikiTab.tsx
autonomous: true
requirements: [VRU-01]

must_haves:
  truths:
    - "Wiki graph shows edges between pages that share at least one frontmatter tag"
    - "No IPC call to window.api.notes.allTags() is made by WikiTab"
    - "Graph edges update whenever the KB is updated (files list reloads)"
  artifacts:
    - path: "src/renderer/src/components/WikiTab.tsx"
      provides: "Shared-tag graph linking logic replacing co-occurrence approach"
      contains: "buildSharedTagLinks"
  key_links:
    - from: "src/renderer/src/components/WikiTab.tsx"
      to: "files state (KbFileEntry[].tags)"
      via: "graphLinks useMemo reads files directly"
      pattern: "files.*tags"
---

<objective>
Replace the broken co-occurrence edge-building approach in the wiki graph with shared-frontmatter-tag linking. Two wiki pages are connected if they share at least one tag (case-insensitive) in their frontmatter. Remove all dead code from the old approach.

Purpose: The co-occurrence approach depended on note-processing state that proved unreliable. Frontmatter tags on wiki pages are always present and already loaded into the `files` state — no additional IPC needed.

Output: WikiTab.tsx with dead code removed and working shared-tag graph edges.
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/STATE.md

<!-- Key interfaces already in scope -->
<!--
KbFileEntry { filename: string; title: string; tags: string[] }

files: KbFileEntry[]  — populated by loadFilesWithTags(), tags parsed from frontmatter
graphNodes: built from files in existing useMemo
graphLinks: currently calls buildCooccurrenceLinks(allNoteTags, nodeIds) — REPLACE THIS

The files array already has tags[] parsed from each file's frontmatter via getFileEntry():
  const tagsMatch = content.match(/^tags:\s*\[(.+?)\]/m)
  const tags = tagsMatch
    ? tagsMatch[1].split(',').map(t => t.trim().replace(/['"]/g, ''))
    : []
-->
</context>

<tasks>

<task type="auto">
  <name>Task 1: Replace co-occurrence linking with shared-tag linking</name>
  <files>src/renderer/src/components/WikiTab.tsx</files>
  <action>
    Make the following changes to WikiTab.tsx:

    1. DELETE the `buildCooccurrenceLinks` function (lines 21-48) entirely.

    2. ADD a new `buildSharedTagLinks` function in its place:

    ```typescript
    // Build edges between wiki pages that share at least one frontmatter tag.
    // Case-insensitive tag comparison. No IPC needed — uses parsed file tags directly.
    function buildSharedTagLinks(
      files: KbFileEntry[]
    ): Array<{ source: string; target: string }> {
      // Map from lowercase tag -> list of node IDs that have it
      const tagToNodes = new Map<string, string[]>()
      for (const f of files) {
        const nodeId = f.filename.replace(/\.md$/, '')
        for (const tag of f.tags) {
          const key = tag.toLowerCase()
          if (!tagToNodes.has(key)) tagToNodes.set(key, [])
          tagToNodes.get(key)!.push(nodeId)
        }
      }
      // For each tag shared by 2+ pages, emit one edge per pair (deduped)
      const seen = new Set<string>()
      const links: Array<{ source: string; target: string }> = []
      for (const nodes of tagToNodes.values()) {
        if (nodes.length < 2) continue
        for (let i = 0; i < nodes.length; i++) {
          for (let j = i + 1; j < nodes.length; j++) {
            const key = [nodes[i], nodes[j]].sort().join('\0')
            if (!seen.has(key)) {
              seen.add(key)
              links.push({ source: nodes[i], target: nodes[j] })
            }
          }
        }
      }
      return links
    }
    ```

    3. REMOVE `allNoteTags` state declaration:
       - Delete: `const [allNoteTags, setAllNoteTags] = useState<string[][]>([])`

    4. REMOVE the `allNoteTags` loading useEffect (lines 108-116):
       - Delete the entire block:
       ```
       useEffect(() => {
         function loadAllTags() {
           window.api.notes.allTags().then(setAllNoteTags)
         }
         loadAllTags()
         const unsub = window.api.onAiUpdate(() => loadAllTags())
         return unsub
       }, [])
       ```

    5. REPLACE the `graphLinks` useMemo:
       - Old: `return buildCooccurrenceLinks(allNoteTags, nodeIds)` (with `nodeIds` computed above it)
       - New:
       ```typescript
       const graphLinks = useMemo(() => buildSharedTagLinks(files), [files])
       ```
       Also remove the `const nodeIds = new Set(graphNodes.map(n => n.id))` line that was only used by the old function (if it still exists inside the useMemo).

    Verify the `allNoteTags` variable is no longer referenced anywhere after removal.
  </action>
  <verify>
    <automated>cd C:/Users/mflma/workspace/AInotepad && npm run build 2>&1 | tail -20</automated>
  </verify>
  <done>
    - Build succeeds with no TypeScript errors
    - `allNoteTags` is not referenced anywhere in WikiTab.tsx
    - `buildCooccurrenceLinks` is not present in WikiTab.tsx
    - `buildSharedTagLinks` function exists and is called in graphLinks useMemo
    - `window.api.notes.allTags` is not called from WikiTab.tsx
  </done>
</task>

</tasks>

<verification>
After build passes:
- Open the app (npm run dev)
- Navigate to the Wiki tab and toggle the graph view
- If any two wiki pages share a tag in their frontmatter (e.g. both have `tags: [AI, ...]`), an edge should appear between them
- Pages with no shared tags should appear as isolated nodes (no edges)
</verification>

<success_criteria>
- TypeScript build passes cleanly
- graphLinks useMemo depends only on `files` (no allNoteTags)
- Dead code (buildCooccurrenceLinks, allNoteTags state, allTags useEffect) fully removed
- Shared-tag edges render correctly in wiki graph for pages with overlapping frontmatter tags
</success_criteria>

<output>
After completion, commit with message:
  fix(wiki): replace co-occurrence with shared-tag linking for graph edges
</output>
