import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export { formatRelativeTimestamp } from "@/lib/time";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
