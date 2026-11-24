import { Text } from "@mantine/core";
import { validHost } from "../contracts";

export function ConnectionHelp({ computerIp }: { computerIp?: string }) {
  return (
    <Text size="sm">
      Turn on the TV and check that it is on the same network as this computer. If you use Developer Mode, set Host PC
      IP to {computerIp && validHost(computerIp) ? computerIp : "this computer’s IP address"} on the TV.
    </Text>
  );
}
