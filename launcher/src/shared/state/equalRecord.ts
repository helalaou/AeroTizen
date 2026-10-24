export const equalRecord = (a: object, b: object): boolean => {
  const left = a as Record<string, unknown>, right = b as Record<string, unknown>;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every(key => Object.is(left[key], right[key]));
};
