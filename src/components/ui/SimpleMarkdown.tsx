import React from "react";

interface SimpleMarkdownProps {
  content: string;
  className?: string;
}

type InlineNode = { type: "text"; value: string } | { type: "code"; value: string } | { type: "strong"; value: string } | { type: "em"; value: string } | { type: "link"; value: string; href: string };

function parseInline(text: string): InlineNode[] {
  const regex = /(\[([^\]]+)\]\(([^)]+)\)|`([^`]+)`|\*\*([^*]+)\*\*|__([^_]+)__|\*([^*]+)\*|_([^_]+)_)/g;
  const nodes: InlineNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) {
      nodes.push({ type: "text", value: text.slice(last, match.index) });
    }

    if (match[2] && match[3]) {
      const href = match[3].trim();
      const safeHref = /^https?:\/\//i.test(href) ? href : "#";
      nodes.push({ type: "link", value: match[2], href: safeHref });
    } else if (match[4]) {
      nodes.push({ type: "code", value: match[4] });
    } else if (match[5] || match[6]) {
      nodes.push({ type: "strong", value: match[5] || match[6] });
    } else if (match[7] || match[8]) {
      nodes.push({ type: "em", value: match[7] || match[8] });
    }

    last = regex.lastIndex;
  }

  if (last < text.length) {
    nodes.push({ type: "text", value: text.slice(last) });
  }

  return nodes.length > 0 ? nodes : [{ type: "text", value: text }];
}

function renderInline(text: string, keyPrefix: string) {
  return parseInline(text).map((node, index) => {
    const key = `${keyPrefix}-${index}`;
    if (node.type === "code") {
      return (
        <code key={key} className="px-1 py-0.5 rounded bg-black/20 text-[0.92em]">
          {node.value}
        </code>
      );
    }
    if (node.type === "strong") {
      return <strong key={key}>{node.value}</strong>;
    }
    if (node.type === "em") {
      return <em key={key}>{node.value}</em>;
    }
    if (node.type === "link") {
      return (
        <a key={key} href={node.href} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:opacity-80">
          {node.value}
        </a>
      );
    }
    return <React.Fragment key={key}>{node.value}</React.Fragment>;
  });
}

export function stripMarkdown(content: string): string {
  return content
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, "$1")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export default function SimpleMarkdown({ content, className }: SimpleMarkdownProps) {
  if (!content) return null;
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i += 1;
      continue;
    }

    if (/^[-*]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*]\s+/, ""));
        i += 1;
      }
      elements.push(
        <ul key={`ul-${i}`} className="list-disc pl-5 space-y-1">
          {items.map((item, idx) => (
            <li key={`li-${i}-${idx}`}>{renderInline(item, `ul-${i}-${idx}`)}</li>
          ))}
        </ul>
      );
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s+/, ""));
        i += 1;
      }
      elements.push(
        <ol key={`ol-${i}`} className="list-decimal pl-5 space-y-1">
          {items.map((item, idx) => (
            <li key={`oli-${i}-${idx}`}>{renderInline(item, `ol-${i}-${idx}`)}</li>
          ))}
        </ol>
      );
      continue;
    }

    if (/^###\s+/.test(trimmed)) {
      elements.push(
        <h3 key={`h3-${i}`} className="text-base font-semibold mt-2">
          {renderInline(trimmed.replace(/^###\s+/, ""), `h3-${i}`)}
        </h3>
      );
      i += 1;
      continue;
    }

    if (/^##\s+/.test(trimmed)) {
      elements.push(
        <h2 key={`h2-${i}`} className="text-lg font-semibold mt-2">
          {renderInline(trimmed.replace(/^##\s+/, ""), `h2-${i}`)}
        </h2>
      );
      i += 1;
      continue;
    }

    if (/^#\s+/.test(trimmed)) {
      elements.push(
        <h1 key={`h1-${i}`} className="text-xl font-bold mt-2">
          {renderInline(trimmed.replace(/^#\s+/, ""), `h1-${i}`)}
        </h1>
      );
      i += 1;
      continue;
    }

    if (/^>\s?/.test(trimmed)) {
      elements.push(
        <blockquote key={`quote-${i}`} className="border-l-2 border-white/20 pl-3 italic opacity-90">
          {renderInline(trimmed.replace(/^>\s?/, ""), `quote-${i}`)}
        </blockquote>
      );
      i += 1;
      continue;
    }

    if (/^(-{3,}|\*{3,})$/.test(trimmed)) {
      elements.push(<hr key={`hr-${i}`} className="border-white/10 my-2" />);
      i += 1;
      continue;
    }

    elements.push(
      <p key={`p-${i}`} className="leading-relaxed">
        {renderInline(line, `p-${i}`)}
      </p>
    );
    i += 1;
  }

  return <div className={`space-y-2 ${className || ""}`}>{elements}</div>;
}
