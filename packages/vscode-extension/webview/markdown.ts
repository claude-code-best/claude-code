import { marked } from "marked";

marked.setOptions({
  gfm: true,
  breaks: true,
});

const renderer = new marked.Renderer();

renderer.code = function ({ text, lang }: { text: string; lang?: string }) {
  const escaped = escapeHtml(text);
  const langAttr = lang ? ` data-ccb-lang="${escapeHtml(lang)}"` : "";
  const langLabel = lang
    ? `<span class="code-lang">${escapeHtml(lang)}</span>`
    : "";
  return `<div class="code-block" data-ccb-code="${encodeURIComponent(text)}"${langAttr}>${langLabel}<pre><code${lang ? ` class="language-${escapeHtml(lang)}"` : ""}>${escaped}</code></pre></div>`;
};

renderer.codespan = function ({ text }: { text: string }) {
  return `<code class="inline-code">${escapeHtml(text)}</code>`;
};

renderer.html = function ({ text }: { text: string }) {
  return escapeHtml(text);
};

marked.use({ renderer });

export function renderMarkdown(text: string): string {
  const raw = marked.parse(text) as string;
  return sanitize(raw);
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

const ALLOWED_TAGS = new Set([
  "p", "br", "hr",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "strong", "em", "b", "i", "u", "s", "del", "ins", "mark", "sub", "sup",
  "ul", "ol", "li",
  "blockquote", "pre", "code",
  "a",
  "table", "thead", "tbody", "tfoot", "tr", "th", "td",
  "div", "span",
  "img",
  "details", "summary",
  "dl", "dt", "dd",
]);

const ALLOWED_ATTRS: Record<string, Set<string>> = {
  a: new Set(["href", "title"]),
  img: new Set(["src", "alt", "title", "width", "height"]),
  code: new Set(["class"]),
  div: new Set(["class", "data-ccb-code", "data-ccb-lang"]),
  span: new Set(["class"]),
  td: new Set(["align"]),
  th: new Set(["align"]),
  pre: new Set(["class"]),
};

const DANGEROUS_URL_PATTERN = /^\s*(javascript|vbscript|data):/i;

function sanitize(html: string): string {
  return html.replace(
    /<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)?\/?>/g,
    (match, tagName: string, attrString: string) => {
      const tag = tagName.toLowerCase();

      if (!ALLOWED_TAGS.has(tag)) {
        return "";
      }

      const isClosing = match.startsWith("</");
      if (isClosing) {
        return `</${tag}>`;
      }

      const isSelfClosing = match.endsWith("/>") || tag === "br" || tag === "hr" || tag === "img";
      const allowedForTag = ALLOWED_ATTRS[tag];
      if (!attrString || !allowedForTag) {
        return isSelfClosing ? `<${tag} />` : `<${tag}>`;
      }

      const safeAttrs: string[] = [];
      const attrRegex = /([a-zA-Z][a-zA-Z0-9_-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))/g;
      let attrMatch: RegExpExecArray | null;
      while ((attrMatch = attrRegex.exec(attrString)) !== null) {
        const attrName = attrMatch[1].toLowerCase();
        const attrValue = attrMatch[2] ?? attrMatch[3] ?? attrMatch[4] ?? "";

        if (!allowedForTag.has(attrName)) {
          continue;
        }

        if (attrName.startsWith("on")) {
          continue;
        }

        if ((attrName === "href" || attrName === "src" || attrName === "action") && DANGEROUS_URL_PATTERN.test(attrValue)) {
          continue;
        }

        safeAttrs.push(`${attrName}="${escapeHtml(attrValue)}"`);
      }

      const attrStr = safeAttrs.length > 0 ? " " + safeAttrs.join(" ") : "";
      return isSelfClosing ? `<${tag}${attrStr} />` : `<${tag}${attrStr}>`;
    }
  );
}
