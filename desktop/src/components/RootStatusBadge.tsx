import { Badge } from "@mantine/core";
import type { rootStatus } from "../tvDetails";

const COLORS = { Yes: "green", No: "red", Unverified: "gray" } as const;

export function RootStatusBadge({ status }: { status: ReturnType<typeof rootStatus> }) {
  return (
    <Badge variant="light" color={COLORS[status]}>
      {status}
    </Badge>
  );
}
