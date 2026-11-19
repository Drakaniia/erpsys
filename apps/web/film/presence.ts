// Dialogs are held at their settled pose. Timing belongs to the Remotion timeline.
export const usePresence = (open: boolean) => ({ mounted: open, style: {} });
export const useReducedMotion = () => true;
export const useEditTimestamp = () => ({ ts: 1, saved: () => {} });
