import type { ReactNode } from "react";

type HighlightTextNode = {
  type: string;
  value?: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: HighlightTextNode[];
};

const HIGHLIGHT_CLASS_NAME = "app-search-highlight";
const HIGHLIGHT_DATA_ATTRIBUTE = "data-preview-highlight";
const HIGHLIGHT_DATA_VALUE = "true";

export const PREVIEW_HIGHLIGHT_SELECTOR = `mark[${HIGHLIGHT_DATA_ATTRIBUTE}="${HIGHLIGHT_DATA_VALUE}"]`;

export function normalizeHighlightQuery(query: string) {
  const normalized = query.trim();
  return normalized.length > 0 ? normalized : "";
}

export function highlightTextContent(
  content: string,
  query: string,
  fallback: string,
): ReactNode {
  const resolvedContent = content || fallback;
  const normalizedQuery = normalizeHighlightQuery(query);

  if (!resolvedContent || !normalizedQuery) {
    return resolvedContent;
  }

  const pattern = new RegExp(`(${escapeHighlightPattern(normalizedQuery)})`, "giu");
  const segments = resolvedContent.split(pattern);

  if (segments.length <= 1) {
    return resolvedContent;
  }

  return segments.map((segment, index) => (
    isHighlightedSegment(segment, normalizedQuery)
      ? (
          <mark
            key={`${segment}-${index}`}
            className={HIGHLIGHT_CLASS_NAME}
            data-preview-highlight={HIGHLIGHT_DATA_VALUE}
          >
            {segment}
          </mark>
        )
      : segment
  ));
}

export function highlightSanitizedHtmlContent(html: string, query: string) {
  const normalizedQuery = normalizeHighlightQuery(query);

  if (!normalizedQuery || typeof document === "undefined") {
    return html;
  }

  const template = document.createElement("template");
  template.innerHTML = html;

  const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  let currentNode = walker.nextNode();

  while (currentNode) {
    if (currentNode instanceof Text) {
      textNodes.push(currentNode);
    }
    currentNode = walker.nextNode();
  }

  for (const textNode of textNodes) {
    const replacement = buildHighlightedFragment(textNode.data, normalizedQuery);
    if (!replacement || !textNode.parentNode) {
      continue;
    }

    textNode.parentNode.replaceChild(replacement, textNode);
  }

  return template.innerHTML;
}

export function createRehypeHighlightPlugin(query: string) {
  const normalizedQuery = normalizeHighlightQuery(query);

  return function rehypeHighlightPlugin() {
    return function transform(tree: HighlightTextNode) {
      if (!normalizedQuery) {
        return tree;
      }

      highlightHastNode(tree, normalizedQuery);
      return tree;
    };
  };
}

function highlightHastNode(node: HighlightTextNode, query: string) {
  if (!Array.isArray(node.children) || node.children.length === 0) {
    return;
  }

  const nextChildren: HighlightTextNode[] = [];

  for (const child of node.children) {
    if (child.type === "text" && typeof child.value === "string") {
      nextChildren.push(...buildHighlightedHastNodes(child.value, query));
      continue;
    }

    highlightHastNode(child, query);
    nextChildren.push(child);
  }

  node.children = nextChildren;
}

function buildHighlightedHastNodes(content: string, query: string) {
  if (!content) {
    return [{ type: "text", value: content }];
  }

  const pattern = new RegExp(`(${escapeHighlightPattern(query)})`, "giu");
  const segments = content.split(pattern);

  if (segments.length <= 1) {
    return [{ type: "text", value: content }];
  }

  return segments
    .filter((segment) => segment.length > 0)
    .map<HighlightTextNode>((segment) => (
      isHighlightedSegment(segment, query)
        ? {
            type: "element",
            tagName: "mark",
            properties: {
              className: [HIGHLIGHT_CLASS_NAME],
              [HIGHLIGHT_DATA_ATTRIBUTE]: HIGHLIGHT_DATA_VALUE,
            },
            children: [{ type: "text", value: segment }],
          }
        : { type: "text", value: segment }
    ));
}

function buildHighlightedFragment(content: string, query: string) {
  const pattern = new RegExp(`(${escapeHighlightPattern(query)})`, "giu");
  const segments = content.split(pattern);

  if (segments.length <= 1) {
    return null;
  }

  const fragment = document.createDocumentFragment();

  for (const segment of segments) {
    if (!segment) {
      continue;
    }

    if (isHighlightedSegment(segment, query)) {
      const mark = document.createElement("mark");
      mark.className = HIGHLIGHT_CLASS_NAME;
      mark.setAttribute(HIGHLIGHT_DATA_ATTRIBUTE, HIGHLIGHT_DATA_VALUE);
      mark.textContent = segment;
      fragment.append(mark);
      continue;
    }

    fragment.append(document.createTextNode(segment));
  }

  return fragment;
}

function escapeHighlightPattern(query: string) {
  return query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isHighlightedSegment(segment: string, query: string) {
  return segment.localeCompare(query, undefined, { sensitivity: "accent", usage: "search" }) === 0
    || segment.toLocaleLowerCase() === query.toLocaleLowerCase();
}
