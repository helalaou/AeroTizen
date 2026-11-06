// Convert historical storage formats on load. Runtime updates use only the current schema.
export const migrateSettings = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const saved = value as Record<string, unknown>;
  const columns =
    typeof saved.homeCardColumns === "number" || typeof saved.homeCardColumns === "string"
      ? Number(saved.homeCardColumns)
      : NaN;
  const migrated = { ...saved };
  if (!saved.home && saved.favorites) {
    migrated.home = saved.favorites;
  }
  if ([3, 4, 5].includes(columns)) {
    migrated.homeCardColumns = columns;
  } else if (saved.cardSize === "small" || saved.cardSize === "big") {
    migrated.homeCardColumns = saved.cardSize === "small" ? 5 : 3;
  }
  delete migrated.favorites;
  delete migrated.cardSize;
  delete migrated.homeCardMode;
  return migrated;
};
