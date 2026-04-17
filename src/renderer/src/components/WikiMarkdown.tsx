import Markdown from 'react-markdown'
import remarkWikiLink from 'remark-wiki-link'
import remarkMath from 'remark-math'
import rehypeRaw from 'rehype-raw'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'

interface WikiMarkdownProps {
  content: string
  existingFiles: string[]
  onNavigate: (filename: string) => void
  insights?: string | null
}

// Strip YAML frontmatter (--- ... ---) so it doesn't appear as raw text.
// Handles: trailing spaces on delimiters, and AI-generated files where the closing
// --- is appended to the last value line (e.g. `updated: 2026-01-01 ---`).
function stripFrontmatter(md: string): string {
  return md.replace(/^---[ \t]*[\r\n][\s\S]*?(?:[\r\n][ \t]*|[ \t])---[ \t]*(?:[\r\n]|$)/, '').trimStart()
}

// Normalize a name for fuzzy matching: lowercase, collapse spaces/underscores to hyphens.
function normalize(s: string): string {
  return s.toLowerCase().replace(/[\s_]+/g, '-')
}

// Build a map from normalized basename → full relative slug (without .md).
// e.g. "concepts/Theory of Everything" → key "theory-of-everything" → value "concepts/Theory of Everything"
// This lets [[Theory of Everything]] resolve to the correct subdir file.
function buildPermalinkMap(existingFiles: string[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const f of existingFiles) {
    const slug = f.replace(/\.md$/, '')                     // "concepts/Theory of Everything"
    const basename = slug.split('/').pop()!                  // "Theory of Everything"
    map.set(normalize(basename), slug)                       // "theory-of-everything" → full slug
    map.set(normalize(slug), slug)                           // "concepts/theory-of-everything" → full slug
    map.set(basename.toLowerCase(), slug)                    // "theory of everything" → full slug
  }
  return map
}

export function WikiMarkdown({ content, existingFiles, onNavigate, insights }: WikiMarkdownProps) {
  const permalinkMap = buildPermalinkMap(existingFiles)
  const permalinks = Array.from(new Set(permalinkMap.values()))

  // Custom resolver: normalize the [[link text]] and look it up in the map.
  // Returns the full slug if found (so hrefTemplate gets the real path),
  // or falls back to the normalized name (renders as a "new page" link).
  const pageResolver = (name: string): string[] => {
    const byNorm = permalinkMap.get(normalize(name))
    if (byNorm) return [byNorm]
    const byLower = permalinkMap.get(name.toLowerCase())
    if (byLower) return [byLower]
    return [normalize(name)]
  }

  const body = stripFrontmatter(content)

  return (
    <div className="prose prose-invert max-w-none p-4 overflow-y-auto h-full text-sm">
      <Markdown
        remarkPlugins={[
          remarkMath,
          [remarkWikiLink, {
            permalinks,
            pageResolver,
            hrefTemplate: (permalink: string) => permalink,
            wikiLinkClassName: 'wiki-link',
            newClassName: 'wiki-link-new',
          }],
        ]}
        rehypePlugins={[rehypeRaw, rehypeKatex]}
        components={{
          a: ({ href, children, className, ...props }) => {
            const isWikiLink = typeof className === 'string' && className.includes('wiki-link')
            if (isWikiLink && href) {
              return (
                <a
                  className={`${className} cursor-pointer text-indigo-400 hover:text-indigo-300 underline`}
                  href="#"
                  onClick={(e) => {
                    e.preventDefault()
                    onNavigate(href + '.md')
                  }}
                  {...props}
                >
                  {children}
                </a>
              )
            }
            return (
              <a
                href={href}
                target="_blank"
                rel="noreferrer"
                className="text-blue-400 hover:text-blue-300 underline"
                {...props}
              >
                {children}
              </a>
            )
          },
        }}
      >
        {body}
      </Markdown>
      {insights && (
        <div className="mt-6 border-t border-white/10 pt-4 not-prose">
          <p className="text-xs uppercase tracking-wider text-amber-500/60 mb-1">AI Insight</p>
          <p className="text-xs italic text-amber-400/70 leading-relaxed">{insights}</p>
        </div>
      )}
    </div>
  )
}
