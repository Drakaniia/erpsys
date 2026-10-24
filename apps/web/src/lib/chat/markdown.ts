import { marked } from "marked";
import DOMPurify from "dompurify";

const ALLOWED_TAGS = [
  "p",
  "br",
  "strong",
  "em",
  "del",
  "code",
  "pre",
  "blockquote",
  "ul",
  "ol",
  "li",
  "a",
  "hr",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
];

const ALLOWED_ATTR = ["href", "title", "target", "rel", "align"];

function hardenLinks(html: string): string {
  return html.replace(/<a\s([^>]*)>/gi, (match, attrs: string) => {
    if (!/href\s*=/i.test(attrs)) return match;
    let next = attrs;
    next = next.replace(/\starget\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, " ");
    next = next.replace(/\srel\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, " ");
    return `<a${next} target="_blank" rel="noopener noreferrer">`;
  });
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderMarkdown(source: string): string {
  const text = source.trim();
  if (text.length === 0) return "";

  if (!DOMPurify.isSupported) return escapeHtml(text);

  const rendered = marked.parse(text, { async: false, breaks: true }) as string;

  return hardenLinks(
    DOMPurify.sanitize(rendered, {
      ALLOWED_TAGS,
      ALLOWED_ATTR,
    }),
  );
}
