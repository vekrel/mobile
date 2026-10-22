import { Button } from "../../components/ui/Button";
import type {
  MachineProject,
  MachineThreadShell,
} from "@vekrel/client-runtime/state/shell";
import { LegendList } from "@legendapp/list/react-native";
import {
  AuthOrchestrationOperateScope,
  type MachineId,
  type MachineKind,
  resolveMachineKind,
} from "@vekrel/contracts";
import { useNavigation } from "@react-navigation/native";
import { AppActivityIndicator } from "../../components/ui/AppActivityIndicator";
import { AppBar } from "../../components/ui/AppBar";
import { SymbolView } from "../../components/ui/AppSymbol";
import { useCallback, useMemo, useRef, type ComponentProps } from "react";
import { Platform, RefreshControl, useWindowDimensions, View } from "react-native";
import { GestureDetector, useNativeGesture } from "react-native-gesture-handler";
import type { SwipeableMethods } from "react-native-gesture-handler/ReanimatedSwipeable";

import { AppText as Text } from "../../components/ui/AppText";
import { EmptyState } from "../../components/ui/EmptyState";
import { MachineSymbol } from "../../components/MachineSymbol";
import { ProjectFavicon } from "../../components/ProjectFavicon";
import { relativeTime } from "../../lib/time";
import { useUniwindTheme } from "../../lib/useUniwindTheme";
import { useServerConfigs } from "../../state/entities";
import { useMachineScope } from "../../state/session";
import { ThreadSwipeable } from "../home/thread-swipe-actions";
import type { ArchivedThreadGroup, ArchivedThreadSortOrder } from "./archivedThreadList";
import { SettingsScreenContent } from "../settings/components/SettingsScreen";

export interface ArchivedThreadsHeaderMachine {
  readonly machineId: MachineId;
  readonly label: string;
}

function ArchivedThreadsHeader(props: {
  readonly machines: ReadonlyArray<ArchivedThreadsHeaderMachine>;
  readonly searchQuery: string;
  readonly selectedMachineId: MachineId | null;
  readonly sortOrder: ArchivedThreadSortOrder;
  readonly onMachineChange: (machineId: MachineId | null) => void;
  readonly onRefresh: () => void;
  readonly onSearchQueryChange: (query: string) => void;
  readonly onSortOrderChange: (sortOrder: ArchivedThreadSortOrder) => void;
}) {
  const navigation = useNavigation();
  const { width } = useWindowDimensions();
  const hasCustomFilter = props.selectedMachineId !== null || props.sortOrder !== "newest";
  return (
    <AppBar
      title="Archived threads"
      sidebar={false}
      onBack={() => navigation.goBack()}
      search={{
        value: props.searchQuery,
        onChangeText: props.onSearchQueryChange,
        placeholder: "Search archived threads",
        compactPlaceholder: "Search",
        mode: "inline",
        compactToolbar: width < 700,
      }}
      menus={[
        {
          title: "Archived thread options",
          icon: hasCustomFilter
            ? "line.3.horizontal.decrease.circle.fill"
            : "line.3.horizontal.decrease.circle",
          items: [
            {
              id: "machine",
              title: "Machine",
              items: [
                {
                  id: "machine:all",
                  title: "All machines",
                  selected: props.selectedMachineId === null,
                  onPress: () => props.onMachineChange(null),
                },
                ...props.machines.map((machine) => ({
                  id: `machine:${machine.machineId}`,
                  title: machine.label,
                  selected: props.selectedMachineId === machine.machineId,
                  onPress: () => props.onMachineChange(machine.machineId),
                })),
              ],
            },
            {
              id: "sort",
              title: "Sort by archived date",
              items: [
                {
                  id: "sort:newest",
                  title: "Newest first",
                  selected: props.sortOrder === "newest",
                  onPress: () => props.onSortOrderChange("newest"),
                },
                {
                  id: "sort:oldest",
                  title: "Oldest first",
                  selected: props.sortOrder === "oldest",
                  onPress: () => props.onSortOrderChange("oldest"),
                },
              ],
            },
            ...(Platform.OS === "android"
              ? [
                  {
                    id: "refresh",
                    title: "Refresh archived threads",
                    onPress: props.onRefresh,
                  },
                ]
              : []),
          ],
        },
      ]}
    />
  );
}

type ArchivedThreadListItem =
  | {
      readonly kind: "project";
      readonly key: string;
      readonly machineLabel: string | null;
      readonly machine: MachineKind;
      readonly project: MachineProject;
    }
  | {
      readonly kind: "thread";
      readonly key: string;
      readonly machineLabel: string | null;
      readonly isFirst: boolean;
      readonly isLast: boolean;
      readonly thread: MachineThreadShell;
    };

function ProjectGroupLabel(props: {
  readonly machineLabel: string | null;
  readonly machine: MachineKind;
  readonly project: MachineProject;
}) {
  return (
    <View className="flex-row items-center gap-2.5 px-1 pb-2">
      <ProjectFavicon
        machineId={props.project.machineId}
        faviconPath={props.project.faviconPath}
        projectIcon={props.project.projectIcon}
        projectTitle={props.project.title}
        size={18}
        workspaceRoot={props.project.workspaceRoot}
      />
      <Text
        className="flex-1 text-xs font-t3-medium tracking-[0.5px] uppercase text-foreground-muted"
        numberOfLines={1}
      >
        {props.project.title}
      </Text>
      {props.machineLabel ? (
        <View className="max-w-[42%] flex-row items-center gap-1">
          <MachineSymbol
            kind={props.machine}
            size={10}
            tintColorClassName="accent-foreground-tertiary"
          />
          <Text className="shrink text-2xs text-foreground-tertiary" numberOfLines={1}>
            {props.machineLabel}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function ArchivedThreadRow(props: {
  readonly machineLabel: string | null;
  readonly isFirst: boolean;
  readonly isLast: boolean;
  readonly onDelete: () => void;
  readonly onSwipeableClose: (methods: SwipeableMethods) => void;
  readonly onSwipeableWillOpen: (methods: SwipeableMethods) => void;
  readonly simultaneousSwipeGesture?: ComponentProps<typeof ThreadSwipeable>["simultaneousWith"];
  readonly onUnarchive: () => void;
  readonly thread: MachineThreadShell;
}) {
  const { width: windowWidth } = useWindowDimensions();
  const cardColor = useUniwindTheme()["--color-grouped-card"];
  const canOperateThread = useMachineScope(
    props.thread.machineId,
    AuthOrchestrationOperateScope,
  );
  const timestamp = relativeTime(props.thread.archivedAt ?? props.thread.updatedAt);
  const subtitle = [props.machineLabel, props.thread.branch].filter((part): part is string =>
    Boolean(part),
  );
  const rowContent = (
    <View
      className={`flex-row items-center gap-3 bg-grouped-card px-4 py-3 ${props.isLast ? "" : "border-b border-separator"}`}
    >
      <View className="h-[34px] w-[34px] items-center justify-center rounded-[11px] bg-subtle">
        <SymbolView
          name="archivebox.fill"
          size={15}
          tintColorClassName="accent-icon-subtle"
          type="monochrome"
        />
      </View>

      <View className="min-w-0 flex-1 gap-1">
        <View className="flex-row items-center gap-2">
          <Text
            className="min-w-0 flex-1 text-base font-t3-bold leading-snug text-foreground"
            numberOfLines={1}
          >
            {props.thread.title}
          </Text>
          <Text className="min-w-[30px] text-right text-xs tabular-nums text-foreground-tertiary">
            {timestamp}
          </Text>
        </View>
        {subtitle.length > 0 ? (
          <View className="flex-row items-center gap-1.5">
            <SymbolView
              name="arrow.triangle.branch"
              size={10}
              tintColorClassName="accent-icon-subtle"
              type="monochrome"
            />
            <Text
              className="min-w-0 flex-1 font-mono text-2xs text-foreground-tertiary"
              numberOfLines={1}
            >
              {subtitle.join(" · ")}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
  const containerStyle = {
    borderTopLeftRadius: props.isFirst ? 20 : 0,
    borderTopRightRadius: props.isFirst ? 20 : 0,
    borderBottomLeftRadius: props.isLast ? 20 : 0,
    borderBottomRightRadius: props.isLast ? 20 : 0,
    overflow: "hidden" as const,
  };
  if (!canOperateThread) return <View style={containerStyle}>{rowContent}</View>;

  return (
    <ThreadSwipeable
      resetKey={`${props.thread.machineId}:${props.thread.id}`}
      threadKey={`${props.thread.machineId}:${props.thread.id}`}
      backgroundColor={cardColor}
      containerStyle={containerStyle}
      fullSwipeWidth={windowWidth - 32}
      onDelete={props.onDelete}
      onSwipeableClose={props.onSwipeableClose}
      onSwipeableWillOpen={props.onSwipeableWillOpen}
      primaryAction={{
        accessibilityLabel: `Unarchive ${props.thread.title}`,
        icon: "arrow.uturn.backward",
        label: "Unarchive",
        onPress: props.onUnarchive,
      }}
      simultaneousWith={props.simultaneousSwipeGesture}
      threadTitle={props.thread.title}
    >
      {() => rowContent}
    </ThreadSwipeable>
  );
}

function ArchiveError(props: { readonly message: string; readonly onRetry: () => void }) {
  return (
    <View className="rounded-[20px] border border-danger-border bg-danger p-4">
      <Text className="text-base font-t3-bold text-danger-foreground">
        Could not load every archive
      </Text>
      <Text className="mt-1 text-sm text-foreground-muted">{props.message}</Text>
      <View className="mt-3">
        <Button label="Try again" tone="secondary" onPress={props.onRetry} />
      </View>
    </View>
  );
}

export function ArchivedThreadsScreen(props: {
  readonly machines: ReadonlyArray<ArchivedThreadsHeaderMachine>;
  readonly error: string | null;
  readonly groups: ReadonlyArray<ArchivedThreadGroup>;
  readonly isLoading: boolean;
  readonly searchQuery: string;
  readonly selectedMachineId: MachineId | null;
  readonly sortOrder: ArchivedThreadSortOrder;
  readonly onDeleteThread: (thread: MachineThreadShell) => void;
  readonly onMachineChange: (machineId: MachineId | null) => void;
  readonly onRefresh: () => void;
  readonly onSearchQueryChange: (query: string) => void;
  readonly onSortOrderChange: (sortOrder: ArchivedThreadSortOrder) => void;
  readonly onUnarchiveThread: (thread: MachineThreadShell) => void;
}) {
  const { onDeleteThread, onUnarchiveThread } = props;
  const openSwipeableRef = useRef<SwipeableMethods | null>(null);
  const archiveScrollGesture = useNativeGesture();
  const machineLabelsById = useMemo(
    () =>
      new Map(
        props.machines.map((machine) => [machine.machineId, machine.label]),
      ),
    [props.machines],
  );
  const serverConfigs = useServerConfigs();
  const listItems = useMemo<ReadonlyArray<ArchivedThreadListItem>>(() => {
    const items: ArchivedThreadListItem[] = [];
    for (const group of props.groups) {
      const machineLabel = machineLabelsById.get(group.project.machineId) ?? null;
      items.push({
        kind: "project",
        key: `${group.key}:project`,
        machineLabel,
        machine: resolveMachineKind(
          serverConfigs.get(group.project.machineId) ?? null,
        ),
        project: group.project,
      });

      group.threads.forEach((thread, index) => {
        items.push({
          kind: "thread",
          key: `${thread.machineId}:${thread.id}`,
          machineLabel,
          isFirst: index === 0,
          isLast: index === group.threads.length - 1,
          thread,
        });
      });
    }
    return items;
  }, [machineLabelsById, props.groups, serverConfigs]);
  const handleSwipeableWillOpen = useCallback((methods: SwipeableMethods) => {
    if (openSwipeableRef.current && openSwipeableRef.current !== methods) {
      openSwipeableRef.current.close();
    }
    openSwipeableRef.current = methods;
  }, []);
  const handleSwipeableClose = useCallback((methods: SwipeableMethods) => {
    if (openSwipeableRef.current === methods) {
      openSwipeableRef.current = null;
    }
  }, []);
  const isInitialLoad = props.isLoading && props.groups.length === 0 && props.error === null;
  const isFiltered = props.searchQuery.trim().length > 0 || props.selectedMachineId !== null;
  const renderListItem = useCallback(
    ({ item }: { item: ArchivedThreadListItem }) => {
      if (item.kind === "project") {
        return (
          <View className="pt-4">
            <ProjectGroupLabel
              machineLabel={item.machineLabel}
              machine={item.machine}
              project={item.project}
            />
          </View>
        );
      }

      return (
        <ArchivedThreadRow
          machineLabel={item.machineLabel}
          isFirst={item.isFirst}
          isLast={item.isLast}
          onDelete={() => onDeleteThread(item.thread)}
          onSwipeableClose={handleSwipeableClose}
          onSwipeableWillOpen={handleSwipeableWillOpen}
          onUnarchive={() => onUnarchiveThread(item.thread)}
          simultaneousSwipeGesture={archiveScrollGesture}
          thread={item.thread}
        />
      );
    },
    [
      archiveScrollGesture,
      handleSwipeableClose,
      handleSwipeableWillOpen,
      onDeleteThread,
      onUnarchiveThread,
    ],
  );
  const listEmptyComponent = useMemo(() => {
    if (isInitialLoad) {
      return (
        <View className="items-center py-16">
          <AppActivityIndicator colorClassName="accent-icon" />
          <Text className="mt-3 text-sm text-foreground-muted">Loading archive...</Text>
        </View>
      );
    }

    return (
      <EmptyState
        detail={
          isFiltered
            ? "Try another search or machine."
            : "Threads you archive will appear here."
        }
        title={isFiltered ? "No matching threads" : "No archived threads"}
      />
    );
  }, [isFiltered, isInitialLoad]);

  return (
    // Keep the list inside this native container. Form-sheet resizing otherwise
    // treats the flattened background as a header and shrinks the list to zero.
    <View collapsable={false} className="flex-1 bg-sheet">
      <ArchivedThreadsHeader
        machines={props.machines}
        searchQuery={props.searchQuery}
        onMachineChange={props.onMachineChange}
        onRefresh={props.onRefresh}
        onSearchQueryChange={props.onSearchQueryChange}
        onSortOrderChange={props.onSortOrderChange}
        selectedMachineId={props.selectedMachineId}
        sortOrder={props.sortOrder}
      />

      <SettingsScreenContent>
        <GestureDetector gesture={archiveScrollGesture}>
          <LegendList
            className="flex-1"
            contentContainerStyle={{
              paddingBottom: 32,
              paddingHorizontal: 16,
              paddingTop: 4,
            }}
            contentInsetAdjustmentBehavior="automatic"
            data={listItems}
            estimatedItemSize={62}
            getItemType={(item) => item.kind}
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
            keyExtractor={(item) => item.key}
            ListEmptyComponent={listEmptyComponent}
            ListHeaderComponent={
              props.error ? <ArchiveError message={props.error} onRetry={props.onRefresh} /> : null
            }
            onScrollBeginDrag={() => openSwipeableRef.current?.close()}
            refreshControl={
              <RefreshControl
                onRefresh={props.onRefresh}
                refreshing={props.isLoading && !isInitialLoad}
                tintColorClassName={String("accent-icon")}
              />
            }
            renderItem={renderListItem}
            showsVerticalScrollIndicator={false}
          />
        </GestureDetector>
      </SettingsScreenContent>
    </View>
  );
}
