import type { PropsWithChildren, ReactElement } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  render,
  type RenderOptions,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider } from "react-i18next";

import {
  appI18n,
  bootstrapI18n,
} from "@/i18n";
import {
  clearMocks,
  installBaseTauriMocks,
  mockConvertFileSrc,
  mockIPC,
  mockWindows,
  resetBaseTauriMocks,
} from "@/test/tauri";

bootstrapI18n();

export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        gcTime: 0,
        retry: false,
        staleTime: 0,
        refetchOnWindowFocus: false,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

type RenderWithProvidersOptions = Omit<RenderOptions, "wrapper"> & {
  queryClient?: QueryClient;
};

export function renderWithProviders(
  ui: ReactElement,
  {
    queryClient = createTestQueryClient(),
    ...options
  }: RenderWithProvidersOptions = {},
) {
  function Wrapper({ children }: PropsWithChildren) {
    return (
      <QueryClientProvider client={queryClient}>
        <I18nextProvider i18n={appI18n}>{children}</I18nextProvider>
      </QueryClientProvider>
    );
  }

  return {
    user: userEvent.setup(),
    queryClient,
    ...render(ui, {
      wrapper: Wrapper,
      ...options,
    }),
  };
}

export {
  clearMocks,
  installBaseTauriMocks,
  mockConvertFileSrc,
  mockIPC,
  mockWindows,
  resetBaseTauriMocks,
  userEvent,
};

export * from "@testing-library/react";
