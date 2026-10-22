export function resolveReviewAvailability(input: {
  readonly hasMachinePresentation: boolean;
  readonly isMachineConnected: boolean;
  readonly hasCachedSelectedDiff: boolean;
  readonly hasAnyCachedDiff: boolean;
}): {
  readonly showConnectionNotice: boolean;
  readonly showSectionToolbar: boolean;
} {
  const showConnectionNotice =
    input.hasMachinePresentation &&
    !input.isMachineConnected &&
    !input.hasCachedSelectedDiff;

  return {
    showConnectionNotice,
    showSectionToolbar: !showConnectionNotice || input.hasAnyCachedDiff,
  };
}
