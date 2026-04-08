import { queryOptions, type QueryClient } from "@tanstack/react-query";

import { queryKeys } from "@/app/query-keys";
import { getClipboardSourceAppIcons, listClipboardSourceApps } from "@/lib/tauri";
import type {
  ClipboardSourceAppIconResult,
  ClipboardSourceAppOption,
} from "@/types/shell";

const CLIPBOARD_SOURCE_APP_ICON_PRELOAD_BATCH_SIZE = 24;

export function clipboardSourceAppsQueryOptions(queryClient: QueryClient) {
  return queryOptions({
    queryKey: queryKeys.clipboardSourceApps(),
    queryFn: async () =>
      mergeClipboardSourceAppsWithCachedIcons(
        await listClipboardSourceApps(),
        getCachedClipboardSourceApps(queryClient) ?? [],
      ),
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
  });
}

export function getCachedClipboardSourceApps(queryClient: QueryClient) {
  return queryClient.getQueryData<ClipboardSourceAppOption[]>(
    queryKeys.clipboardSourceApps(),
  );
}

export async function preloadClipboardSourceApps(queryClient: QueryClient) {
  return queryClient.fetchQuery(clipboardSourceAppsQueryOptions(queryClient));
}

export function cacheClipboardSourceAppIcons(
  queryClient: QueryClient,
  icons: ClipboardSourceAppIconResult[],
) {
  if (icons.length === 0) {
    return;
  }

  const nextIconPaths = new Map(
    icons
      .map((icon) => [icon.appPath.trim(), icon.iconPath] as const)
      .filter(([appPath]) => appPath.length > 0),
  );

  queryClient.setQueryData<ClipboardSourceAppOption[] | undefined>(
    queryKeys.clipboardSourceApps(),
    (current) => {
      if (!current || current.length === 0) {
        return current;
      }

      let hasChanges = false;
      const next = current.map((option) => {
        const appPath = option.appPath?.trim();
        if (!appPath) {
          return option;
        }

        if (!nextIconPaths.has(appPath)) {
          return option;
        }

        const iconPath = nextIconPaths.get(appPath) ?? null;
        if (option.iconPath === iconPath) {
          return option;
        }

        hasChanges = true;
        return {
          ...option,
          iconPath,
        };
      });

      return hasChanges ? next : current;
    },
  );
}

export function getClipboardSourceAppPathsMissingIcons(
  options: ClipboardSourceAppOption[],
) {
  const paths: string[] = [];
  const seenPaths = new Set<string>();

  for (const option of options) {
    const appPath = option.appPath?.trim();
    if (!appPath || option.iconPath || seenPaths.has(appPath)) {
      continue;
    }

    seenPaths.add(appPath);
    paths.push(appPath);
  }

  return paths;
}

export async function preloadClipboardSourceAppIcons(queryClient: QueryClient) {
  const options = await preloadClipboardSourceApps(queryClient);
  const missingPaths = getClipboardSourceAppPathsMissingIcons(options);

  for (
    let index = 0;
    index < missingPaths.length;
    index += CLIPBOARD_SOURCE_APP_ICON_PRELOAD_BATCH_SIZE
  ) {
    const batch = missingPaths.slice(
      index,
      index + CLIPBOARD_SOURCE_APP_ICON_PRELOAD_BATCH_SIZE,
    );
    const icons = await getClipboardSourceAppIcons(batch);
    cacheClipboardSourceAppIcons(queryClient, icons);

    if (index + CLIPBOARD_SOURCE_APP_ICON_PRELOAD_BATCH_SIZE < missingPaths.length) {
      await waitForNextIdleSlice();
    }
  }
}

function mergeClipboardSourceAppsWithCachedIcons(
  nextOptions: ClipboardSourceAppOption[],
  cachedOptions: ClipboardSourceAppOption[],
) {
  if (nextOptions.length === 0 || cachedOptions.length === 0) {
    return nextOptions;
  }

  const cachedIconByAppPath = new Map<string, string | null>();
  const cachedIconByBundleId = new Map<string, string | null>();

  for (const option of cachedOptions) {
    const bundleId = option.bundleId.trim().toLowerCase();
    const appPath = option.appPath?.trim();

    if (appPath && option.iconPath !== null) {
      cachedIconByAppPath.set(appPath, option.iconPath);
    }
    if (bundleId && option.iconPath !== null) {
      cachedIconByBundleId.set(bundleId, option.iconPath);
    }
  }

  return nextOptions.map((option) => {
    if (option.iconPath) {
      return option;
    }

    const appPath = option.appPath?.trim();
    const bundleId = option.bundleId.trim().toLowerCase();
    const cachedIconPath =
      (appPath ? cachedIconByAppPath.get(appPath) : undefined)
      ?? cachedIconByBundleId.get(bundleId);

    return cachedIconPath === undefined
      ? option
      : {
          ...option,
          iconPath: cachedIconPath,
        };
  });
}

function waitForNextIdleSlice() {
  return new Promise<void>((resolve) => {
    if (typeof window === "undefined") {
      resolve();
      return;
    }

    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(() => resolve(), { timeout: 240 });
      return;
    }

    window.setTimeout(resolve, 48);
  });
}
