/**
 * Cold-start detection.
 *
 * This flag is `true` only on a fresh JS load — i.e. a real cold start after
 * the app was killed (swiped away from the app switcher / terminated). A warm
 * resume (the app was only backgrounded) keeps the JS runtime alive, so the
 * flag stays `false`.
 *
 * Used to require sign-in again after the app is killed instead of silently
 * restoring the persisted session straight into the Portal.
 */
let coldStartPending = true;

export function isColdStartPending(): boolean {
  return coldStartPending;
}

export function markColdStartHandled(): void {
  coldStartPending = false;
}
