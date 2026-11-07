# App Launch Performance Techniques — Notes from Video

> **Source:** Uploaded 93-second video. These notes extract the readable on-screen text and code, then organize the visible ideas into reusable implementation techniques. Some small text is difficult to read at video resolution, so code and labels below should be verified against the original project before copying.

## Main idea

Improve perceived launch speed by showing useful cached content immediately instead of making the user wait for many sequential network requests. Fetch secondary information after the first screen is visible, and prioritize requests by importance.

## Techniques shown

### 1. Avoid blocking app launch on network calls

The slide labeled `AppLaunch.swift` shows this pattern:

```swift
// no network call on launch
if let session = SessionStore.cached {
    showHome(for: session.user)
}
```

**How to apply it**

- Read an existing session or other essential state from local storage.
- If cached state is valid, render the home screen immediately.
- Start refreshes in the background rather than waiting for them before showing the first screen.
- Handle missing, expired, or invalid cached state with an appropriate sign-in or loading flow.

### 2. Reduce sequential network requests

The video contrasts a long chain of requests with a launch queue. It calls out roughly **20 sequential network requests** and illustrates requests such as:

- `GET /session`
- `GET /subscription`
- `GET /question/today`
- `GET /me/xp`
- `GET /leaderboard`
- `GET /streak`

The exact endpoint spelling is not fully legible in every frame.

**How to apply it**

- Identify which requests are truly required to display the first screen.
- Avoid making request B wait for request A if B does not depend on A.
- Run independent requests concurrently.
- Defer nonessential information (for example, leaderboard or streak details) until after the initial screen appears.
- Where appropriate, combine related data into one backend endpoint to reduce round trips.

### 3. Prioritize the launch queue

A visible slide titled **“LAUNCH QUEUE”** orders requests by priority. The first item is shown as completed, the next as active, and later items as waiting.

A practical queue could look like this:

1. **Critical:** restore session and show the main screen.
2. **High:** fetch data needed for the first interaction.
3. **Normal:** refresh progress, XP, or daily-question data.
4. **Low:** load leaderboard, streak details, and other secondary content.

This is a suggested interpretation of the visual technique, not a claim that the video specifies these exact priority levels.

### 4. Use a saved snapshot for instant rendering

The slide titled **“SAVED SNAPSHOT”** displays a local data object with fields resembling:

```json
{
  "todaysQuestion": {
    "done": true
  },
  "streak": 4,
  "xp": 2360,
  "level": "Junior Dev",
  "league": "Silver",
  "reviewQueue": 135,
  "nextLesson": "CDNs & Edge"
}
```

**How to apply it**

- Persist a compact snapshot of the data needed to render the main screen.
- Render from the last saved snapshot while fresh data loads.
- Replace stale values when the network response arrives.
- Include a timestamp/version and define how to handle expired or incompatible cached data.
- Avoid storing secrets or sensitive data in an insecure cache.

The values above are examples transcribed from the slide, not recommended defaults.

### 5. Measure launch performance and slow connections

The video includes timing illustrations for home Wi‑Fi and a slow connection, with different launch durations. The exact benchmark conditions are not fully readable.

**How to apply it**

- Measure time to first useful screen, not only time until every request finishes.
- Track cold launch and warm launch separately.
- Test on slow networks, high latency, and offline conditions.
- Log request duration and identify which requests are on the critical path.
- Set performance targets based on real device and production measurements.

## Suggested implementation checklist

- [ ] Show a useful first screen from cached state when safe.
- [ ] Keep nonessential network requests off the launch-critical path.
- [ ] Parallelize independent requests.
- [ ] Prioritize requests by what the user needs first.
- [ ] Persist a small, versioned snapshot for fast rendering.
- [ ] Refresh cached data in the background and handle failures gracefully.
- [ ] Add loading, stale-data, empty-state, and signed-out handling.
- [ ] Measure cold/warm launch time and test poor network conditions.

## Example launch flow

```text
App starts
   |
   v
Read cached session and screen snapshot
   |
   +--> Cache is usable --> Render home immediately
   |                         |
   |                         v
   |                    Refresh data in background
   |                         |
   |                         v
   |                    Update screen and cache
   |
   +--> No usable cache --> Show sign-in or lightweight loading state
                             |
                             v
                        Fetch required data
```

## Important cautions

- Cached data can be stale; show freshness appropriately and reconcile it with the server.
- Do not use cached authentication state as the sole authorization mechanism. The server must still enforce access.
- Parallel requests can overload a backend if concurrency is unbounded; use sensible limits and cancellation.
- Only combine endpoints when it improves the actual bottleneck and fits the application's data needs.

## Short takeaway

**Render first, refresh second.** Restore safe cached state, keep the launch path small, run independent requests concurrently, and delay secondary data until the user needs it.
