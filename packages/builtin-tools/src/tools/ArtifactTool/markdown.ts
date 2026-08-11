import { basename } from 'path'
import { marked, type Tokens } from 'marked'

/**
 * Convert a Markdown string into a complete HTML document with a neutral,
 * minimal stylesheet (one Claude-Orange accent). Used by the artifact tool
 * to accept .md files alongside .html.
 */
export function markdownToHtml(md: string, filename?: string): string {
  const body = marked.parse(md, {
    async: false,
    gfm: true,
    breaks: false,
  }) as string
  const title = extractTitle(md) ?? fallbackTitle(filename)
  return wrapDocument(body, title)
}

function extractTitle(md: string): string | undefined {
  for (const token of marked.lexer(md)) {
    if (token.type === 'heading' && (token as Tokens.Heading).depth === 1) {
      return (token as Tokens.Heading).text
    }
  }
  return undefined
}

function fallbackTitle(filename?: string): string {
  if (!filename) return 'Artifact'
  return basename(filename).replace(/\.(md|markdown)$/i, '') || 'Artifact'
}

function wrapDocument(body: string, title: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<link rel="stylesheet" href="https://unpkg.com/@highlightjs/cdn-assets@11.10.0/styles/github.min.css">
<style>
:root { --accent: #D77757; }
body { font: 14px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 800px; margin: 2rem auto; padding: 0 1rem; color: #1a1a1a; }
h1 { border-bottom: 2px solid var(--accent); padding-bottom: .3rem; }
h2 { margin-top: 1.5em; }
img { max-width: 100%; }
pre { background: #f6f6f6; padding: .75rem 1rem; border-radius: 4px; overflow-x: auto; }
code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
pre code { background: none; padding: 0; }
.hljs { background: transparent; padding: 0; }
table { border-collapse: collapse; width: 100%; margin: 1em 0; }
th, td { border: 1px solid #ddd; padding: 6px 10px; text-align: left; }
th { background: #f6f6f6; }
blockquote { border-left: 3px solid var(--accent); margin: 0; padding: .25rem 1rem; color: #555; }
a { color: var(--accent); }
.mermaid { text-align: center; margin: 1em 0; }
</style>
</head>
<body>
${body}
<script src="https://unpkg.com/mermaid@11/dist/mermaid.min.js"></script>
<script src="https://unpkg.com/@highlightjs/cdn-assets@11.10.0/highlight.min.js"></script>
<script>
(function () {
  // Hoist mermaid fence blocks out of <pre><code> before hljs touches them,
  // otherwise highlight.js would mangle the diagram source as if it were JS.
  document.querySelectorAll('pre code.language-mermaid').forEach(function (code) {
    var pre = code.parentElement;
    var div = document.createElement('div');
    div.className = 'mermaid';
    div.textContent = code.textContent;
    pre.replaceWith(div);
  });
  if (window.mermaid) {
    window.mermaid.initialize({ startOnLoad: false, theme: 'default', securityLevel: 'loose' });
    window.mermaid.run();
  }
  if (window.hljs) {
    window.hljs.highlightAll();
  }
})();
</script>
</body>
</html>`
}

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"]/g,
    c =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
      })[c] as string,
  )
}
