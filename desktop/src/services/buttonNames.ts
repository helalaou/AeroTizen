export const MAX_BUTTON_NAME_LENGTH = 48;

export function validButtonName(name: string): boolean {
  return Boolean(
    name && name === name.trim() && name.length <= MAX_BUTTON_NAME_LENGTH && !/[\p{Cc}\p{Cs}\p{Zl}\p{Zp}]/u.test(name),
  );
}

export function buttonNameExists(name: string, names: readonly string[], original?: string): boolean {
  return names.some((existing) => existing !== original && existing.toLowerCase() === name.toLowerCase());
}
