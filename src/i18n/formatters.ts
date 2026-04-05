import { getCurrentAppLocale } from "@/i18n/runtime";

function asDate(value: Date | number | string) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatAppDateTime(
  value: Date | number | string,
  options?: Intl.DateTimeFormatOptions,
) {
  const date = asDate(value);
  if (!date) {
    return "--";
  }

  return new Intl.DateTimeFormat(
    getCurrentAppLocale(),
    options ?? {
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      month: "2-digit",
    },
  ).format(date);
}

export function formatAppList(
  values: Iterable<string>,
  options?: Intl.ListFormatOptions,
) {
  return new Intl.ListFormat(
    getCurrentAppLocale(),
    options ?? {
      style: "long",
      type: "conjunction",
    },
  ).format(Array.from(values));
}

export function formatAppNumber(
  value: number,
  options?: Intl.NumberFormatOptions,
) {
  return new Intl.NumberFormat(getCurrentAppLocale(), options).format(value);
}

export function formatAppRelativeTime(
  value: Date | number | string,
  options?: Intl.RelativeTimeFormatOptions & {
    baseTime?: Date | number | string;
  },
) {
  const date = asDate(value);
  const { baseTime: baseTimeValue, ...formatOptions } = options ?? {};
  const baseTime = asDate(baseTimeValue ?? Date.now());
  if (!date || !baseTime) {
    return "--";
  }

  const diffMs = date.getTime() - baseTime.getTime();
  const seconds = Math.round(diffMs / 1_000);
  const minutes = Math.round(diffMs / (60 * 1_000));
  const hours = Math.round(diffMs / (60 * 60 * 1_000));
  const days = Math.round(diffMs / (24 * 60 * 60 * 1_000));

  const formatter = new Intl.RelativeTimeFormat(
    getCurrentAppLocale(),
    Object.keys(formatOptions).length
      ? formatOptions
      : {
      numeric: "auto",
      style: "long",
      },
  );

  if (Math.abs(days) >= 1) {
    return formatter.format(days, "day");
  }

  if (Math.abs(hours) >= 1) {
    return formatter.format(hours, "hour");
  }

  if (Math.abs(minutes) >= 1) {
    return formatter.format(minutes, "minute");
  }

  return formatter.format(seconds, "second");
}
