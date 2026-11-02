import { describe, expect, it } from "vitest";
import { renderMarkdown } from "./markdown";

describe("renderMarkdown", () => {
  it("returns an empty string for empty and whitespace-only input", () => {
    expect(renderMarkdown("")).toBe("");
    expect(renderMarkdown("   \n\t  ")).toBe("");
  });

  it("renders basic inline markdown", () => {
    const html = renderMarkdown("Bring **two** forms and a *valid* ID.");
    expect(html).toContain("<strong>two</strong>");
    expect(html).toContain("<em>valid</em>");
  });

  it("renders unordered lists", () => {
    const html = renderMarkdown("- Step one\n- Step two");
    expect(html).toContain("<ul>");
    expect(html).toContain("<li>Step one</li>");
    expect(html).toContain("<li>Step two</li>");
  });

  it("renders ordered lists", () => {
    const html = renderMarkdown("1. Submit the form\n2. Wait for approval");
    expect(html).toContain("<ol>");
    expect(html).toContain("<li>Submit the form</li>");
  });

  it("renders fenced code blocks", () => {
    const html = renderMarkdown("```\nconst x = 1;\n```");
    expect(html).toContain("<pre>");
    expect(html).toContain("<code>");
    expect(html).toContain("const x = 1;");
  });

  it("treats single newlines as line breaks", () => {
    const html = renderMarkdown("Line one\nLine two");
    expect(html).toContain("<br>");
  });

  it("strips script tags", () => {
    const html = renderMarkdown("Hello<script>alert('xss')</script>");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("alert('xss')");
  });

  it("strips event handler attributes", () => {
    const html = renderMarkdown('<img src="x" onerror="alert(1)">');
    expect(html).not.toContain("onerror");
    expect(html).not.toContain("<img");
  });

  it("strips javascript: hrefs", () => {
    const html = renderMarkdown("[click me](javascript:alert(1))");
    expect(html.toLowerCase()).not.toContain("javascript:");
  });

  it("strips inline styles and iframes", () => {
    const html = renderMarkdown(
      '<p style="position:fixed">hi</p><iframe src="x"></iframe>',
    );
    expect(html).not.toContain("style=");
    expect(html).not.toContain("<iframe");
  });

  it("opens links in a new tab with a safe rel", () => {
    const html = renderMarkdown("[SBO](https://sbo.buksu.edu.ph)");
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('href="https://sbo.buksu.edu.ph"');
  });

  it("does not duplicate target or rel if the source already had them", () => {
    const html = renderMarkdown(
      '<a href="https://example.com" target="_self" rel="nofollow">x</a>',
    );
    expect(html.match(/target=/g) ?? []).toHaveLength(1);
    expect(html.match(/rel=/g) ?? []).toHaveLength(1);
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it("leaves anchors without an href untouched", () => {
    const html = renderMarkdown('<a name="anchor">section</a>');
    expect(html).toContain("section");
    expect(html).not.toContain("_blank");
  });
});
