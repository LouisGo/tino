import dayjs from "dayjs";

import { formatAppDateTime } from "@/i18n";

export type TimeInput = string | number | Date;

function toDate(input: TimeInput) {
  const value = input instanceof Date ? input : new Date(input);
  return Number.isNaN(value.getTime()) ? null : value;
}

export function nowIsoString() {
  return dayjs().toISOString();
}

export function minutesAgoIsoString(minutes: number) {
  return dayjs().subtract(minutes, "minute").toISOString();
}

export function formatTimestamp(input: TimeInput) {
  const value = toDate(input);

  if (!value) {
    return "--";
  }

  return formatAppDateTime(value);
}

export function formatRelativeTimestamp(input: TimeInput) {
  return formatTimestamp(input);
}
