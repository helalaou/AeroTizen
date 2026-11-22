export type Candidate = Readonly<Record<string, unknown>>;

export const asRecord = (value: unknown) => (value && typeof value === "object" ? (value as Candidate) : undefined);

export const titleKey = (value: unknown) =>
  typeof value === "string"
    ? value
        .trim()
        .toLowerCase()
        .replace(/\u2019/g, "'")
        .replace(/\s+/g, " ")
    : "";
