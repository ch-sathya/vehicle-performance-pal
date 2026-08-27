# Vehicle Performance Assistant — F1 First

A 3D telemetry and setup assistant. Version one runs on a simulated F1 car, with the vehicle definition kept data-driven so a truck or road car can be dropped in later.

## Screens

Single-page dashboard at `/` with four zones:

1. **3D Car Viewer** — CC0 GLB F1 model with labelled hotspot markers on every part (nose, front wing, sidepods, floor, halo, engine cover, rear wing, diffuser, 4 tyres, brakes, suspension). Clicking a marker opens that part's panel: its name, live sensor readings, and any adjustable setup values.
2. **Track** — 2D circuit map as the primary view: track outline, moving car marker, sector colouring, and a speed-vs-distance trace. A separate tab shows the car on a simple 3D circuit with a chase camera.
3. **Performance** — live gauges (speed, RPM, gear, throttle/brake, DRS) plus channel charts for tyre temps, brake temps, fuel, ERS.
4. **Results** — lap table with sector splits, best/theoretical-best lap, delta to previous run, and a comparison of laps run under different setups.

## Setup adjustability

Sliders for front/rear wing angle, ride height, tyre pressure, camber, brake bias, differential, gear ratios, and fuel load. Each does two things:

- Visibly moves the 3D geometry (wing rotation, ride height offset, camber tilt).
- Feeds the lap simulation, so downforce, drag, top speed, tyre wear, and lap time change and show up in Results.

## Telemetry

A client-side simulator drives everything: it runs the car around the track model at ~30 Hz, deriving speed, RPM, gear, throttle/brake, g-forces, tyre and brake temps, and fuel burn from the corner geometry and the current setup. Play/pause, restart, and speed multiplier controls. No backend or account needed; laps persist in local storage.

## Multi-vehicle readiness

Each vehicle is one config object: model file, part list with hotspot positions, sensor list, setup parameters with ranges, and physics constants. Adding a truck later means adding a config plus a model, not rewriting the UI. A vehicle picker sits in the header with F1 selected and other entries marked as coming next.

## Design direction

Race-engineer instrument aesthetic: near-black carbon background, warm amber and signal-red accents, condensed technical type, tight data-dense panels, thin rules instead of heavy cards. No generic SaaS cards or purple gradients.

## Technical notes

- React Three Fiber + drei on a client-only route (`ssr: false`); `<Canvas>` never server-renders.
- CC0 GLB sourced from Kenney / Quaternius / poly.pizza, validated before any code references it; procedural fallback if no suitable licence-clean model downloads.
- Local `<Environment>` with `Lightformer`s — no CDN HDR presets.
- Simulation loop in `useFrame` with delta-time clamping; damping via `Math.exp(-k*dt)`.
- Charts with Recharts; 2D track map as SVG with `d3`-style zoom/pan.
- Head metadata on the index route with app-specific title/description/og tags.
- Verified in-browser with a Playwright screenshot pass before hand-off.
