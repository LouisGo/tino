export const MARKDOWN_SCROLL_SHELL_CLASS = "app-markdown-scroll-shell";
export const MARKDOWN_TABLE_CLASS = "app-markdown-table";
export const MARKDOWN_TABLE_SCROLL_CLASS = "app-markdown-table-scroll";

export function normalizePreviewHtmlLayout(html: string) {
  if (typeof document === "undefined") {
    return html;
  }

  const template = document.createElement("template");
  template.innerHTML = html;

  for (const table of template.content.querySelectorAll("table")) {
    if (!(table instanceof HTMLTableElement)) {
      continue;
    }

    table.classList.add(MARKDOWN_TABLE_CLASS);

    if (table.parentElement?.classList.contains(MARKDOWN_TABLE_SCROLL_CLASS)) {
      continue;
    }

    const wrapper = document.createElement("div");
    wrapper.className = `${MARKDOWN_SCROLL_SHELL_CLASS} ${MARKDOWN_TABLE_SCROLL_CLASS}`;
    const parent = table.parentNode;

    if (!parent) {
      continue;
    }

    parent.insertBefore(wrapper, table);
    wrapper.appendChild(table);
  }

  return template.innerHTML;
}
