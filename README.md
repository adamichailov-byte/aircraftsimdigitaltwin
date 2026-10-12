# Aircraft Manufacturing Digital Twin Demo

An interactive, standalone 3D concept model of a fictional aircraft final-assembly campus. It is a visual engineering and portfolio demo: the facility, aircraft, people, equipment, metrics, and movement are illustrative. It does not connect to a real factory, use manufacturer CAD, or require a backend.

## Run locally

Requires Node.js 22.12 or newer and a WebGL 2 capable browser.

```powershell
npm.cmd ci
npm.cmd run dev -- --host 127.0.0.1
```

Open the local URL printed by Vite. To check the project:

```powershell
npm.cmd run typecheck
npm.cmd run test:unit
npm.cmd run build
```

## Explore the model

- Drag with the left mouse button to orbit; right-drag or Shift-drag to pan; use the scroll wheel to zoom. On touch screens, drag to orbit and use two fingers to pan or zoom.
- Focus the 3D scene and hold **W/A/S/D** to move the camera relative to the view. Arrow keys pan in steps, **+ / −** zoom, and **Home** resets the camera. The on-screen Home and zoom controls are available too.
- Use the process list to focus a work area. Select a bay banner or a person, aircraft, vehicle, or other modeled item to inspect its illustrative details. Moving the camera clears the selected work area.
- Use **Options** to show or hide roofs, overhead beams, buildings, and the aircraft close-up view.
- Use the playback controls to pause, reset, or change the speed of the scripted demonstration. Workers, the aircraft tow tug, and other moving demo objects follow authored routes; their positions are not live telemetry.

## What is modeled

The campus centers on one large square production hall where all aircraft assembly takes place. It includes six work areas, receiving and kitting, parts storage, supporting buildings, inbound logistics, and an aircraft apron with dedicated checks and delivery stands. Taxi and apron markings guide the illustrated tow from the paint bay toward checks and the delivery stand.

The teaching sequence follows an aircraft from inbound logistics and receiving through stores, fuselage and wing assembly, systems installation, landing gear and engines, cabin fit-out, paint, ground checks, flight-line acceptance, off-site flight test, and delivery. Several aircraft stages appear in the hall so the layout can be explored as a campus rather than a live production schedule. The process order and all facility dimensions are planning assumptions for this concept model, not verified factory data.

The aircraft is an original fictional A-100 model. Geometry and roles are simplified for a readable demonstration and are not manufacturer CAD or engineering release data. See [ASSETS.md](ASSETS.md) for asset authorship and attribution.
