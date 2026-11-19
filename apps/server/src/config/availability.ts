export const AVAILABILITY_IDLE_MS = 60 * 60 * 1000;

type AvailabilityPresence = {
  isOpen: boolean;
  lastActiveAt?: Date | string | null;
};

export function isAvailabilityLive(
  av: AvailabilityPresence,
  now: number = Date.now(),
): boolean {
  if (!av.isOpen) return false;
  if (!av.lastActiveAt) return false;
  return new Date(av.lastActiveAt).getTime() > now - AVAILABILITY_IDLE_MS;
}
