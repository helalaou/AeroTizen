const formatters = new Map<string, Intl.DateTimeFormat>();

const formatterFor = (timeZone: string) => {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US-u-nu-latn", {
      timeZone,
      hour12: false,
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
};

// Returns a Date whose local fields show the wall-clock time in `timeZone`, so existing
// formatters can render it unchanged. Unknown zones and engines without time zone support
// keep the TV's own time.
export const zonedDate = (timestamp: number, timeZone: string): Date => {
  const date = new Date(timestamp);
  if (!timeZone) {
    return date;
  }
  try {
    const parts: Record<string, number> = {};
    for (const { type, value } of formatterFor(timeZone).formatToParts(date)) {
      if (type !== "literal") {
        parts[type] = Number(value);
      }
    }
    const zoned = new Date(parts.year, parts.month - 1, parts.day, parts.hour % 24, parts.minute, parts.second);
    return Number.isNaN(zoned.getTime()) ? date : zoned;
  } catch {
    return date;
  }
};
