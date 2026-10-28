import { useState } from "react";

/**
 * Guide-tour and keyboard-shortcut sheet state. The two sheets are mutually
 * exclusive, so opening either closes the other.
 */
export function useGuideTour() {
  const [shortcutsOpen, setShortcutsOpenState] = useState(false);
  const [guideOpen, setGuideOpenState] = useState(false);
  const [guideStep, setGuideStep] = useState<1 | 2 | 3 | 4>(1);
  const [guideDontShow, setGuideDontShow] = useState(true);

  function setShortcutsOpen(v: boolean) {
    setShortcutsOpenState(v);
    if (v) setGuideOpenState(false);
  }
  function setGuideOpen(v: boolean) {
    setGuideOpenState(v);
    if (v) setShortcutsOpenState(false);
  }

  function openGuide(step: 1 | 2 | 3 | 4 = 1) {
    setGuideStep(step);
    setGuideOpenState(true);
    setShortcutsOpenState(false);
  }

  function closeGuide() {
    setGuideOpenState(false);
  }

  function nextGuideStep() {
    if (guideStep < 4) setGuideStep((step) => (step + 1) as 1 | 2 | 3 | 4);
  }

  function prevGuideStep() {
    if (guideStep > 1) setGuideStep((step) => (step - 1) as 1 | 2 | 3 | 4);
  }

  function goToGuideStep(step: 1 | 2 | 3 | 4) {
    setGuideStep(step);
  }

  return {
    shortcutsOpen,
    setShortcutsOpen,
    guideOpen,
    setGuideOpen,
    guideStep,
    setGuideStep,
    guideDontShow,
    setGuideDontShow,
    openGuide,
    closeGuide,
    nextGuideStep,
    prevGuideStep,
    goToGuideStep,
  };
}
