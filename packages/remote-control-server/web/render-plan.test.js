import { describe, expect, test } from "bun:test";

import { formatPlanContent } from "./render.js";

describe("formatPlanContent", () => {
  test("renders headings, paragraphs, and lists for plan panels", () => {
    const html = formatPlanContent(`## Summary
Line one
Line two

- First item
- Second item

1. Step one
2. Step two`);

    expect(html).toContain("<h2>Summary</h2>");
    expect(html).toContain("<p>Line one<br>Line two</p>");
    expect(html).toContain("<ul><li>First item</li><li>Second item</li></ul>");
    expect(html).toContain("<ol><li>Step one</li><li>Step two</li></ol>");
  });

  test("escapes unsafe markup and preserves inline formatting plus code blocks", () => {
    const html = formatPlanContent(`**Bold** with \`inline\` and <script>alert(1)</script>

\`\`\`js
const markup = "<div>";
\`\`\``);

    expect(html).toContain("<strong>Bold</strong>");
    expect(html).toContain("<code");
    expect(html).toContain("inline</code>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("<pre><code>const markup = &quot;&lt;div&gt;&quot;;</code></pre>");
  });
});
