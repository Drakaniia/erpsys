// Dialogs are held at their settled pose. Timing belongs to the Remotion timeline.
export const usePresence = (open:boolean) => ({mounted:open, style:{}});
export const useReducedMotion = () => true;
export const useEditingPresence = () => ({editors:[], error:false, ts:1, saved:()=>{}});
