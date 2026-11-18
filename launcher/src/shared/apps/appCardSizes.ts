const APP_CARD_SIZES = {
  small: { labelKey: "appearance.small", columns: { home: 5, apps: 6 } },
  medium: { labelKey: "appearance.medium", columns: { home: 4, apps: 5 } },
  large: { labelKey: "appearance.large", columns: { home: 3, apps: 4 } },
} as const;

const sizes = Object.values(APP_CARD_SIZES);

export const APP_CARD_SIZE_OPTIONS = sizes.map((size) => ({
  value: String(size.columns.home),
  labelKey: size.labelKey,
}));

// The saved preference identifies a size by its Home column count.
export const getAppGridColumns = (homeColumns: number, page: "home" | "apps") => {
  const size = sizes.find((size) => size.columns.home === homeColumns) ?? APP_CARD_SIZES.large;
  return size.columns[page];
};
