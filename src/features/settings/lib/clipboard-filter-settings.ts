import type {
  ClipboardSourceAppOption,
  ClipboardSourceAppRule,
} from "@/types/shell";

const KEYWORD_SEPARATORS = /[;\n\r；]+/;

function normalizeBundleId(bundleId: string) {
  return bundleId.trim().toLowerCase();
}

export function formatClipboardExcludedKeywords(keywords: string[]) {
  return keywords.join("; ");
}

export function parseClipboardExcludedKeywordsInput(input: string) {
  const seen = new Set<string>();
  const keywords: string[] = [];

  for (const candidate of input.split(KEYWORD_SEPARATORS)) {
    const keyword = candidate.trim();
    if (!keyword) {
      continue;
    }

    const dedupeKey = keyword.toLowerCase();
    if (seen.has(dedupeKey)) {
      continue;
    }

    seen.add(dedupeKey);
    keywords.push(keyword);
  }

  return keywords;
}

export function matchesClipboardSourceAppSearch(
  option: ClipboardSourceAppOption,
  search: string,
) {
  const normalizedSearch = search.trim().toLowerCase();
  if (!normalizedSearch) {
    return true;
  }

  return [
    option.appName,
    option.bundleId,
    option.appPath ?? "",
  ]
    .join(" ")
    .toLowerCase()
    .includes(normalizedSearch);
}

export function appendClipboardSourceAppRule(
  rules: ClipboardSourceAppRule[],
  option: ClipboardSourceAppOption,
) {
  const bundleIdKey = normalizeBundleId(option.bundleId);
  if (!bundleIdKey) {
    return rules;
  }

  if (rules.some((rule) => normalizeBundleId(rule.bundleId) === bundleIdKey)) {
    return rules;
  }

  return [
    ...rules,
    {
      bundleId: option.bundleId.trim(),
      appName: option.appName.trim() || option.bundleId.trim(),
    },
  ];
}

export function removeClipboardSourceAppRule(
  rules: ClipboardSourceAppRule[],
  bundleId: string,
) {
  const bundleIdKey = normalizeBundleId(bundleId);
  return rules.filter((rule) => normalizeBundleId(rule.bundleId) !== bundleIdKey);
}
