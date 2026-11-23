import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Group,
  Menu,
  Skeleton,
  Stack,
  Table,
  Text,
  Title,
  Tooltip,
  VisuallyHidden,
} from "@mantine/core";
import { MoreHorizontal, RefreshCw } from "lucide-react";
import { useState } from "react";
import type {
  ButtonChange,
  ButtonInventoryChange,
  ButtonMappings,
  ButtonTargetApp,
  TvButtonMapping,
} from "../contracts";
import styles from "../styles.module.css";
import { ButtonInventoryDialog } from "./ButtonInventoryDialog";
import { ChooseButtonAppDialog } from "./ChooseButtonAppDialog";
import { RenameButtonDialog } from "./RenameButtonDialog";

interface ButtonMappingPanelProps {
  tvName: string;
  mappings: ButtonMappings | null;
  loading: boolean;
  error: string | null;
  onRefresh(): void;
  actions?: {
    busy: boolean;
    apps: ButtonTargetApp[] | null;
    appsLoading: boolean;
    appsError: string | null;
    changeError: string | null;
    loadApps(): void;
    cancelApps(): void;
    change(change: ButtonChange, reportError?: (message: string) => void): Promise<boolean>;
    updateInventory(change: ButtonInventoryChange, reportError: (message: string) => void): Promise<boolean>;
  };
}

function assignment(mapping: TvButtonMapping) {
  if (mapping.mode === "default") return "Original action";
  if (mapping.mode === "disabled") return "Disabled";
  return mapping.app_name ?? mapping.app_id ?? "Unknown app";
}

export function ButtonMappingPanel({ tvName, mappings, loading, error, onRefresh, actions }: ButtonMappingPanelProps) {
  const [picker, setPicker] = useState<TvButtonMapping | null>(null);
  const [inventoryAction, setInventoryAction] = useState<"learn" | "reset" | null>(null);
  const [renaming, setRenaming] = useState<TvButtonMapping | null>(null);

  return (
    <div className={styles.detailContent}>
      <Stack gap="lg">
        <Group justify="space-between">
          <Title order={1}>Button mapping</Title>
          <Group gap="xs">
            {mappings?.status === "ready" && actions && (
              <Button variant="default" disabled={actions.busy} onClick={() => setInventoryAction("learn")}>
                Learn a button
              </Button>
            )}
            <Tooltip label="Refresh button mappings">
              <ActionIcon
                variant="subtle"
                aria-label="Refresh button mappings"
                loading={loading}
                disabled={actions?.busy}
                onClick={onRefresh}
              >
                <RefreshCw size={18} />
              </ActionIcon>
            </Tooltip>
            {mappings?.status === "ready" && actions && (
              <Menu position="bottom-end">
                <Menu.Target>
                  <ActionIcon variant="subtle" aria-label="Button mapping options" disabled={actions.busy}>
                    <MoreHorizontal size={18} />
                  </ActionIcon>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Item color="red" onClick={() => setInventoryAction("reset")}>
                    Reset all buttons
                  </Menu.Item>
                </Menu.Dropdown>
              </Menu>
            )}
          </Group>
        </Group>
        {loading && (
          <Stack gap="sm" role="status" aria-label="Loading button mappings">
            <Skeleton height={36} />
            <Skeleton height={36} />
            <Skeleton height={36} />
          </Stack>
        )}
        {error && (
          <Alert role="alert" color="red" title="Could not load button mappings">
            {error}
          </Alert>
        )}
        {actions?.changeError && (
          <Alert role="alert" color="red" title="Could not save the button assignment">
            {actions.changeError}
          </Alert>
        )}
        {mappings?.status === "pairing_required" && (
          <Alert title="Paired TV helper required">
            Button mapping is available on rooted TVs with a paired AeroTizen helper.
          </Alert>
        )}
        {mappings?.status === "helper_update_required" && (
          <Alert title="Update the TV helper">The paired helper needs an update to show button mappings.</Alert>
        )}
        {mappings?.status === "ready" && (
          <Stack gap="sm">
            {mappings.discovery_detail && (
              <Text size="sm" c="dimmed">
                {mappings.discovery_detail}
              </Text>
            )}
            {mappings.buttons.length === 0 ? (
              <Text c="dimmed">
                {mappings.discovery_detail ? "No saved button assignments." : "No app buttons found."}
              </Text>
            ) : (
              <Table withRowBorders horizontalSpacing="sm" verticalSpacing="sm" aria-label="Remote app buttons">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th scope="col">Button</Table.Th>
                    <Table.Th scope="col">Assignment</Table.Th>
                    <Table.Th scope="col">Status</Table.Th>
                    {actions && (
                      <Table.Th scope="col" w={50}>
                        <VisuallyHidden>Actions</VisuallyHidden>
                      </Table.Th>
                    )}
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {mappings.buttons.map((mapping) => (
                    <Table.Tr key={mapping.button}>
                      <Table.Th scope="row">{mapping.button}</Table.Th>
                      <Table.Td style={{ overflowWrap: "anywhere" }}>{assignment(mapping)}</Table.Td>
                      <Table.Td>
                        {mapping.mode !== "default" && (
                          <Badge color={mapping.active ? "green" : "orange"} variant="light">
                            {mapping.active ? "Active" : "Pending"}
                          </Badge>
                        )}
                      </Table.Td>
                      {actions && (
                        <Table.Td ta="right">
                          <Menu position="bottom-end">
                            <Menu.Target>
                              <ActionIcon
                                variant="subtle"
                                aria-label={`Actions for ${mapping.button}`}
                                disabled={actions.busy}
                              >
                                <MoreHorizontal size={18} />
                              </ActionIcon>
                            </Menu.Target>
                            <Menu.Dropdown>
                              <Menu.Item onClick={() => setRenaming(mapping)}>Rename</Menu.Item>
                              <Menu.Item
                                onClick={() => {
                                  actions.loadApps();
                                  setPicker(mapping);
                                }}
                              >
                                Choose app
                              </Menu.Item>
                              <Menu.Item
                                disabled={mapping.mode === "disabled"}
                                onClick={() => void actions.change({ button: mapping.button, mode: "disabled" })}
                              >
                                Disable
                              </Menu.Item>
                              <Menu.Item
                                disabled={mapping.mode === "default"}
                                onClick={() => void actions.change({ button: mapping.button, mode: "default" })}
                              >
                                Restore original action
                              </Menu.Item>
                            </Menu.Dropdown>
                          </Menu>
                        </Table.Td>
                      )}
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            )}
          </Stack>
        )}
      </Stack>
      {inventoryAction && actions && (
        <ButtonInventoryDialog
          action={inventoryAction}
          tvName={tvName}
          buttonNames={mappings?.status === "ready" ? mappings.buttons.map((row) => row.button) : []}
          onSubmit={actions.updateInventory}
          onClose={() => setInventoryAction(null)}
        />
      )}
      {renaming && actions && (
        <RenameButtonDialog
          key={renaming.button}
          button={renaming.button}
          buttonNames={mappings?.status === "ready" ? mappings.buttons.map((row) => row.button) : []}
          onSubmit={actions.updateInventory}
          onClose={() => setRenaming(null)}
        />
      )}
      {picker && actions && (
        <ChooseButtonAppDialog
          mapping={picker}
          apps={actions.apps}
          loading={actions.appsLoading}
          error={actions.appsError}
          onSave={actions.change}
          onClose={() => {
            actions.cancelApps();
            setPicker(null);
          }}
        />
      )}
    </div>
  );
}
