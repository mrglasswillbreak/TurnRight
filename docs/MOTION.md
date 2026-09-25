# Compass and motion assistance

Status: **Awaiting device verification**. Browser simulations are software checks; they do not establish physical sensor accuracy or battery performance.

## Permissions and controls

The shared page service uses `deviceorientation`, `deviceorientationabsolute` and `devicemotion`. It does not require the Generic Sensor API. Where supported, orientation and motion `requestPermission` methods are invoked independently and synchronously from the first **Find my location** or navigation/survey **Start** tap, before asynchronous work. HTTPS is required. Denials and the assistance preference are remembered on this device; an explicit **Enable/Retry sensors** action retries. **Turn off sensors** stops acquisition. A denied or absent sensor never blocks GPS.

Public Settings and active navigation offer **Travel-up** (default), **North-up** and **Phone-up**. The active walk and Survey have expandable **Compass & motion controls**. Each capability reports inactive, requesting, available, denied, unavailable or temporarily missing readings. An exposed API is insufficient: usable readings must arrive. If no data arrives within five seconds, the capability is unavailable; interrupted data is shown as missing. Missing permission or readings can require browser/site settings before Retry succeeds.

The response Permissions-Policy permits accelerometer, gyroscope and magnetometer for the same origin, while retaining same-origin geolocation and denying camera/microphone. No database, admin API or campus schema change is needed.

## Direction and movement

Phone direction and GPS course remain separate. A purple cone shows approximate phone direction at a usable GPS fix; a blue arrow shows GPS travel direction when speed/course are usable. Without usable GPS, only compass status is shown. Apple compass readings reference magnetic north and are labelled approximate. Otherwise only explicitly absolute orientation can supply north; relative alpha is never a compass.

Foreground location tracking keeps the position dot and compass active while exploring, including after zooming out to the globe without an active route. The globe labels the fresh fix **You are here** and switches to **Last known location** after 12 seconds without a new fix. Stale or unusable direction readings disappear. Arrows use the projected local direction on the globe and are hidden behind it. Position/heading updates do not pull the camera back after a manual pan or zoom; **Follow me** resumes following. Location and direction still require the device's GPS and optional sensors; an offline map does not simulate either.

Heading normalization projects the screen's top edge onto the ground using device tilt and screen rotation. Near-vertical singularities hide the heading and suggest holding the phone flatter. Invalid readings or Apple reported compass error above 30 degrees hide it; absent accuracy is labelled unreported. Circular smoothing handles 359/0 degrees. Fresh quiet gyroscope readings may corroborate an unchanged sparse compass; rotation without a corresponding orientation update invalidates it. Interruptions reset filters.

Travel-up uses the existing GPS course rule. North-up uses zero bearing. Phone-up uses the approximate compass, then usable GPS course, then holds the current bearing with a visible fallback explanation. Manual map gestures suspend following immediately; **Follow me** restores the selected mode without resetting zoom or pitch after the first location focus. Surveys own their existing north-up GPS following, and sensor updates never move review/entrance crosshairs.

Initial thresholds in `motion-model.ts` are provisional: acceleration RMS below 0.2 m/s² and rotation RMS below 3°/s for three seconds produce **Likely still**; acceleration RMS above 0.8 m/s² for one second produces **Motion detected**; other evidence is **Uncertain**. Missing rotation cannot confirm stillness, and rotation alone cannot imply walking. Linear acceleration is preferred; gravity-inclusive readings use a warmed-up gravity filter. These hints never drive GPS acceptance, navigation progress, arrival, rerouting, recording state or geometry.

## Ownership and privacy

`motion-service.ts` owns one listener set for active consumers. `motion-model.ts` normalizes readings and maintains transient filters. `MotionAssistance.tsx` confines subscriptions to status/overlays instead of rerendering the application for each event. Processing is capped at 30 Hz per input stream and sensor UI notifications at 10 Hz.

Hidden pages and inactive consumers stop sensor listeners and clear readings. Existing location-tracking/navigation sessions may reacquire on returning. Survey pause, entrance capture, finish, exit and sign-out release acquisition; backgrounded/recovered surveys require explicit Resume. Installing an app update retains existing survey/editor recovery rules and never reloads an active recording automatically.

Only `turnright:motion-assistance:v1` preferences are saved: enabled/asked flags, denied channels and map orientation. Raw events, heading, motion windows and device identifiers stay out of storage, surveys, analytics, backups and public packages. Source geometry and GPS types are unchanged.

## Verification

Run with Node 22 from `web`: `npm test`, `npm run lint`, `npm run build`, `npm run test:browser`, `npm run test:survey-webkit`, and `npm run test:survey-pwa`.

Unit coverage includes angle wrap, cardinal screen rotations, tilt singularities, magnetic/absolute/relative readings, invalid/missing data, motion hysteresis, gravity filtering, sparse callbacks, permission timing and denial, shared listener ownership, interruption resets, rate limits and preference-only persistence. A GPS replay compares navigation decisions and survey geometry with assistance absent, working and malfunctioning.

Phone browser tests use real MapLibre with controlled sensors/GPS and test-only authentication/APIs. They cover first-tap permission timing, denial/retry, travel-up default, mode switching, camera gestures, fallback, paused survey recovery, stable entrance placement and absence of sensor data in recovery/upload payloads. The isolated production-PWA scenario also exercises sensors during prepared offline recording, reopening and private sync. Physical checks below remain necessary even when these tests pass.

Software verification on 12 September 2026 used Node 22.23.2: 135 Vitest tests, seven Python tests, 12 Chromium scenarios, five WebKit scenarios and the production-PWA offline scenario pass. Lint passes with seven pre-existing warnings; application/API compilation and production build pass. The authenticated preview verified survey start/pause/finish with denied sensor permission, recoverable empty review, public Travel-up default, permission controls and dark appearance. The empty local preview survey is named “Motion preview check — no field recording”; it was not applied to the map or published.

The final preview also verified remembered denials after an application update and retention of the local recovery record. Release commit `37c8cbe` reached production on 12 September 2026 ([Vercel deployment](https://vercel.com/muhammed-abdulhadi-s-projects/turnright/CXCRtcwa8u8LQuKdU85opEArGGq8)). Live responses include the same-origin sensor policy, deny camera/microphone, return 401 with `no-store` for unauthenticated survey listing, and retain public package `lasu-4e4c8008b38b` / schema 1. This deployment did not publish campus data or establish physical-device verification.

## Physical device record — pending

Record device model, OS/browser versions, installed-app status, test date, results and threshold adjustments for each platform. No physical verification has been recorded yet.

| Check | Android Chrome | iPhone Safari | Installed apps |
| --- | --- | --- | --- |
| First start, partial denial, retry and permission revocation | Pending | Pending | Pending |
| Standing turns and walking with phone pointed sideways | Pending | Pending | Pending |
| Portrait/landscape, steep tilt and magnetic interference | Pending | Pending | Pending |
| Weak GPS, sparse orientation and unavailable hardware | Pending | Pending | Pending |
| Screen lock/app switching, survey explicit Resume | Pending | Pending | Pending |
| Prepared offline startup, recovery and app update | Pending | Pending | Pending |
| Thirty-minute battery use and motion threshold tuning | Pending | Pending | Pending |

Keep this label until Android and iPhone checks, including installed apps, pass. Do not interpret these checks as campus route field verification or publish campus data as part of an application deployment.

## References

- [W3C Device Orientation and Motion](https://www.w3.org/TR/orientation-event/) — event coordinates, absolute references, permissions and lifecycle requirements.
- [Apple DeviceOrientationEvent](https://developer.apple.com/documentation/webkitjs/deviceorientationevent) — WebKit compass properties.
