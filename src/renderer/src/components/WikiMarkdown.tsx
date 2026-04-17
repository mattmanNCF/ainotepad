import Markdown from 'react-markdown'
import remarkWikiLink from 'remark-wiki-link'
import rehypeRaw from 'rehype-raw'

interface WikiMarkdownProps {
  content: string
  existingFiles: string[]          // filenames like "quantum-entanglement.md"
  onNavigate: (filename: string) => void
  insights?: string | null         // optional AI insight for this page
}

export function WikiMarkdown({ content, existingFiles, onNavigate }: WikiMarkdownProps) {
  // remark-wiki-link needs slugs (without .md) to distinguish known vs new links
  const permalinks = existingFiles.map(f => f.replace(/\.md$/, ''))

  return (
    <div className="prose prose-invert max-w-none p-4 overflow-y-auto h-full text-sm">
      <Markdown
        remarkPlugins={[[remarkWikiLink, {
          permalinks,
          hrefTemplate: (permalink: string) => permalink,
          wikiLinkClassName: 'wiki-link',
          newClassName: 'wiki-link-new',
        }]]}
        rehypePlugins={[rehypeRaw]}
        components={{
          a: ({ href, children, className, ...props }) => {
            // Intercept wiki-link clicks — class is set by remark-wiki-link
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
            // External links open in default browser
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
        {content}
      </Markdown>
    </div>
  )
}
