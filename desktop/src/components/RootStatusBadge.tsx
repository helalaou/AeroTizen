import { Badge } from "@mantine/core";
import type { SavedTv } from "../contracts";
import { rootStatus } from "../tvDetails";

const COLORS = { Yes: "green", No: "red", Unverified: "gray" } as const;

export function RootStatusBadge({ profile }: { profile: SavedTv }) {
  const status = rootStatus(profile);
  return (
    <Badge variant="light" color={COLORS[status]}>
      {status}
    </Badge>
  );
}
