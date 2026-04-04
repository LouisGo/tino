import dayjs from "dayjs";
import "dayjs/locale/zh-cn";

dayjs.locale("zh-cn");

export type TimeInput = string | number | Date;

const DEFAULT_DISPLAY_FORMAT = "MM/DD HH:mm";

function toDayjs(input: TimeInput) {
  return dayjs(input);
}

export function nowIsoString() {
  return dayjs().toISOString();
}

export function minutesAgoIsoString(minutes: number) {
  return dayjs().subtract(minutes, "minute").toISOString();
}

export function formatTimestamp(input: TimeInput, format = DEFAULT_DISPLAY_FORMAT) {
  const value = toDayjs(input);

  if (!value.isValid()) {
    return "--";
  }

  return value.format(format);
}

export function formatRelativeTimestamp(input: TimeInput) {
  return formatTimestamp(input);
}
