# Aircraft Assembly Simulation

A standalone, interactive 3D simulation of a fictional aircraft final-assembly plant. Explore the factory, follow aircraft and material-handling work, and see how schedules, inventory, staffing, and disruptions affect production.

This is a learning and portfolio project. It runs in your browser and needs no backend or account.

## Run it

Install [Node.js 22.12 or newer](https://nodejs.org/) and use a WebGL 2 capable browser. From this folder:

```powershell
npm ci
npm run dev
```

Open the local address shown in the terminal. To create and preview a production build:

```powershell
npm run build
npm run preview
```

## Explore

- Orbit with the mouse, right-drag to pan, and scroll to zoom. Focus the scene and use **W/A/S/D** to move the camera. **Home** resets the view; **+ / −** adjusts zoom.
- Use **Options** to show or hide roofs, structural beams, and supporting buildings. Choose a guided tour or a production stage to focus an area.
- Select an aircraft in the scene or in the aircraft list to inspect its tasks, materials, resources, and alerts. Use **Follow aircraft** to track a moving aircraft; camera input releases tracking.
- Play, pause, or advance the simulation clock. Open the master schedule, timeline, and production results to inspect work, queues, deliveries, inventory use, and modeled costs.
- Adjust scenario settings to explore bounded changes to supply, staffing, task durations, quality checks, and the work calendar. **Apply settings & restart** starts a fresh run paused; press **Play** to watch it unfold. The full-horizon calculation in Run results is an optional batch shortcut. Compare runs or use seeded experiments to see a range of possible outcomes.

For ready-to-import runs, see [Example scenarios](examples/README.md). User guides are in [docs](docs/).

## What the model represents

The plant builds one fictional A-100 aircraft through a sequence of assembly bays, paint, acceptance checks, and delivery. Its discrete-event simulation models work tasks, shifts, finite crews and equipment, incoming inventory deliveries, station capacity, aircraft movement, and a shared production schedule. The 3D scene presents the current or historical state of that model.

All aircraft, plant geometry, rates, capacities, schedules, and outcomes are illustrative. They are not based on manufacturer CAD, released work instructions, a validated factory, or live operational data. The demo does not connect to industrial systems and is not an engineering, safety, delivery, or financial forecast. See [asset and model notes](ASSETS.md) and the guides for cost and scenario assumptions.
