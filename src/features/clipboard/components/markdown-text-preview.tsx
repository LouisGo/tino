import {
  Children,
  isValidElement,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from "react";

import { Check, Copy } from "lucide-react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight, { type Options as RehypeHighlightOptions } from "rehype-highlight";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";

import { Tooltip } from "@/components/ui/tooltip";
import { createRehypeHighlightPlugin } from "@/features/clipboard/lib/clipboard-preview-highlight";
import { useScopedT } from "@/i18n";
import {
  openExternalLink,
  resolveExternalLinkTarget,
} from "@/lib/external-links";
import { cn } from "@/lib/utils";

const MARKDOWN_SYNTAX_HIGHLIGHT_OPTIONS = {
  plainText: ["plaintext", "text", "txt"],
} satisfies RehypeHighlightOptions;
const MARKDOWN_SYNTAX_HIGHLIGHT_PLUGIN: [typeof rehypeHighlight, RehypeHighlightOptions] = [
  rehypeHighlight,
  MARKDOWN_SYNTAX_HIGHLIGHT_OPTIONS,
];

export function MarkdownTextPreview({
  markdown,
  highlightQuery,
}: {
  markdown: string;
  highlightQuery: string;
}) {
  const highlightPlugin = useMemo(
    () => createRehypeHighlightPlugin(highlightQuery),
    [highlightQuery],
  );
  const rehypePlugins = useMemo(
    () => [rehypeSanitize, MARKDOWN_SYNTAX_HIGHLIGHT_PLUGIN, highlightPlugin],
    [highlightPlugin],
  );

  return (
    <div className="app-markdown-preview app-selectable app-kind-text-text max-w-[72ch] text-[13px] leading-[1.7]">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={rehypePlugins}
        components={{
          a: ({ href, children, ...props }) => {
            const target = resolveExternalLinkTarget(href ?? "");

            if (!target) {
              return (
                <a {...props} href={href}>
                  {children}
                </a>
              );
            }

            return (
              <a
                {...props}
                href={target}
                rel="noopener noreferrer"
                target="_blank"
                onClick={(event) => {
                  event.preventDefault();
                  void openExternalLink(target);
                }}
              >
                {children}
              </a>
            );
          },
          pre: MarkdownCodeBlock,
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}

function MarkdownCodeBlock({
  children,
  className,
  node,
  ...props
}: ComponentPropsWithoutRef<"pre"> & { node?: unknown }) {
  const tCommon = useScopedT("common");
  const copyResetTimeoutRef = useRef<number | null>(null);
  const [didCopy, setDidCopy] = useState(false);
  const codeElement = findCodeElement(children);
  const rawCode = codeElement ? extractTextContent(codeElement.props.children) : "";
  const language = resolveCodeLanguageLabel(
    typeof codeElement?.props.className === "string" ? codeElement.props.className : "",
  );

  useEffect(() => () => {
    if (copyResetTimeoutRef.current !== null) {
      window.clearTimeout(copyResetTimeoutRef.current);
    }
  }, []);

  void node;

  if (!codeElement) {
    return (
      <pre {...props} className={className}>
        {children}
      </pre>
    );
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(rawCode);
      setDidCopy(true);
      if (copyResetTimeoutRef.current !== null) {
        window.clearTimeout(copyResetTimeoutRef.current);
      }
      copyResetTimeoutRef.current = window.setTimeout(() => {
        setDidCopy(false);
        copyResetTimeoutRef.current = null;
      }, 1600);
    } catch (error) {
      console.error("[clipboard] failed to copy markdown code block", error);
    }
  }

  const copyLabel = didCopy
    ? tCommon("clipboardPreview.copiedToClipboard")
    : tCommon("clipboardPreview.copyCodeBlock");

  return (
    <div className="app-markdown-code-block">
      <div className="app-markdown-code-block__content">
        <div
          data-window-drag-disabled="true"
          className="app-markdown-code-block__header"
        >
          <span className="app-markdown-code-block__language">
            {language}
          </span>
          <Tooltip
            content={copyLabel}
            placement="bottom"
            className="app-preview-action-tooltip rounded-full px-3 py-1.5 text-[11px] font-medium"
          >
            <button
              type="button"
              data-window-drag-disabled="true"
              aria-label={copyLabel}
              className="app-markdown-code-block__copy"
              onClick={() => void handleCopy()}
            >
              {didCopy ? <Check className="size-3" /> : <Copy className="size-3" />}
            </button>
          </Tooltip>
        </div>
        <pre {...props} className={cn("app-markdown-code-block__pre", className)}>
          {children}
        </pre>
      </div>
    </div>
  );
}

type MarkdownCodeElementProps = {
  className?: string;
  children?: ReactNode;
};

function findCodeElement(children: ReactNode) {
  const [firstChild] = Children.toArray(children);

  if (!isValidElement<MarkdownCodeElementProps>(firstChild) || firstChild.type !== "code") {
    return null;
  }

  return firstChild;
}

function extractTextContent(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }

  if (Array.isArray(node)) {
    return node.map(extractTextContent).join("");
  }

  if (isValidElement<{ children?: ReactNode }>(node)) {
    return extractTextContent(node.props.children);
  }

  return "";
}

const CODE_LANGUAGE_LABELS: Record<string, string> = {
  bash: "Bash",
  csharp: "C#",
  css: "CSS",
  go: "Go",
  html: "HTML",
  java: "Java",
  javascript: "JavaScript",
  js: "JavaScript",
  json: "JSON",
  jsx: "JSX",
  markdown: "Markdown",
  md: "Markdown",
  plaintext: "Plain text",
  py: "Python",
  python: "Python",
  rs: "Rust",
  rust: "Rust",
  sh: "Shell",
  shell: "Shell",
  sql: "SQL",
  text: "Plain text",
  ts: "TypeScript",
  tsx: "TSX",
  txt: "Plain text",
  typescript: "TypeScript",
  xml: "XML",
  yaml: "YAML",
  yml: "YAML",
  zsh: "Zsh",
};

function resolveCodeLanguageLabel(className: string) {
  const languageToken = className
    .split(/\s+/)
    .find((token) => token.startsWith("language-") || token.startsWith("lang-"));

  if (!languageToken) {
    return "Code";
  }

  const language = languageToken.replace(/^(language|lang)-/, "").toLowerCase();
  return CODE_LANGUAGE_LABELS[language] ?? humanizeCodeLanguage(language);
}

function humanizeCodeLanguage(language: string) {
  return language
    .split(/[-_+]+/)
    .filter((segment) => segment.length > 0)
    .map((segment) => (
      segment.length <= 3
        ? segment.toUpperCase()
        : `${segment.charAt(0).toUpperCase()}${segment.slice(1)}`
    ))
    .join(" ");
}
