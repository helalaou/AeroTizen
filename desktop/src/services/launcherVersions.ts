const STABLE_VERSION = /^(?:0|[1-9]\d{0,2})(?:\.(?:0|[1-9]\d{0,2})){2}$/;

export function compareLauncherVersions(left: string, right: string): number | null {
  if (!STABLE_VERSION.test(left) || !STABLE_VERSION.test(right)) return null;
  const leftParts = left.split(".").map(Number);
  const rightParts = right.split(".").map(Number);
  for (const [index, part] of leftParts.entries()) {
    const difference = part - (rightParts[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

export function launcherUpdate(installed: string | null, latest: string | null | undefined): string | null {
  if (!installed || !latest) return null;
  return (compareLauncherVersions(latest, installed) ?? 0) > 0 ? latest : null;
}
