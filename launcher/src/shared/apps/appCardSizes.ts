const APP_CARD_SIZES = {
  tiny: { labelKey: "appearance.tiny", columns: { home: 8, apps: 9 } },
  verySmall: { labelKey: "appearance.verySmall", columns: { home: 7, apps: 8 } },
  small: { labelKey: "appearance.small", columns: { home: 6, apps: 7 } },
  medium: { labelKey: "appearance.medium", columns: { home: 5, apps: 6 } },
  large: { labelKey: "appearance.large", columns: { home: 4, apps: 5 } },
  veryLarge: { labelKey: "appearance.veryLarge", columns: { home: 3, apps: 4 } },
} as const;

const sizes = Object.values(APP_CARD_SIZES);

export const APP_CARD_SIZE_OPTIONS = sizes.map((size) => ({
  value: String(size.columns.home),
  labelKey: size.labelKey,
}));

// The saved preference identifies a size by its Home column count.
export const getAppGridColumns = (homeColumns: number, page: "home" | "apps") => {
  const size = sizes.find((size) => size.columns.home === homeColumns) ?? APP_CARD_SIZES.veryLarge;
  return size.columns[page];
};
