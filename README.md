# Assembly — AD-03

Standalone aircraft-campus and original A-100 aircraft demonstration. Requires Node >=22.12.

From `C:\OperationsIntelligence\aircraft-demo`:

```powershell
npm.cmd ci
npm.cmd run dev -- --host 127.0.0.1 --port 5174 --strictPort
```

Open http://127.0.0.1:5174. Drag to orbit, right-drag or Shift-drag to pan, scroll to zoom. Tab to the canvas for arrow-key pan, +/− zoom and Home reset. Home view and zoom buttons also work. Touch: one finger orbit; two fingers pan/zoom.

```powershell
npm.cmd run typecheck
npm.cmd run build
npm.cmd run preview
```

Open **Options** for the **Roofs**, **Overhead beams** and **Buildings** layers. Roofs switches between closed buildings and cutaway interiors; Overhead beams removes the horizontal roofline and cross-bay members while leaving columns; Buildings hides structures while retaining foundations and circulation. These controls preserve the camera. The menu closes on an outside click or Escape. The campus contains one 440 × 440 m square production hall with six work areas, receiving/kitting and parts/inventory support buildings, rail alignment, cargo apron, one marked flight-check stand and two delivery stands. Only the main hall has aircraft-sized doors. All aircraft production stays inside it. Teal pedestrian paths are separated from grey vehicle roads; amber markings trace the aircraft tow sequence from paint to checks and delivery. Teal check markings and ochre delivery markings distinguish the two apron areas. The short teal ruler beside the assembly hall spans 60 m.

Open **Options → Aircraft close-up** to inspect the cabin-stage A-100. This opens the roofs, closes the menu and focuses the camera; drag to inspect other angles. Buildings can be hidden to remove structural occlusion. Home restores the campus camera. The left process panel maps each step to the campus; its collapse button gives more room to the scene.

The illustrative sequence has thirteen steps: inbound logistics, receiving, stores and kitting, fuselage join, wing/tail join, systems installation, gear/engines, cabin fit-out, paint, ground checks, flight-line acceptance, off-site flight test, and delivery. Six static aircraft stages occupy Bays 01–06; the paint booth contains an additional masked aircraft; a finished aircraft sits on the delivery apron. Receiving pallets show fuselage sections, a wing/tail kit, and cabin/electrical kits. Fixtures include access platforms, carts, and stores racks. Process order is an explanatory teaching sequence, not a takt plan: systems work may overlap; paint is shown before final checks, and flight test takes place off site. Inbound carriers are campus context; their arrival and movements come later. Assembly and work clearance remain fictional planning assumptions pending plant observation.

Coordinates are ground-plane X,Z in metres. The original fictional aircraft is 60 m long, spans 60 m and has a 17 m tail height above its floor. Named groups separate fuselage, wings, tail, engines and gear. The forward cockpit glazing wraps over the nose in two panes with separate side windows. Cabin and systems aircraft have small cutaways; joined aircraft sit on their gear or supports. See ASSETS.md for authorship.

Illustrative 1,100 × 850 m parcel; assembly hall has 32 m nominal clear height and a central aisle leading to the flight-line apron. No backend, credentials or downloaded assets needed. WebGL 2 is required; the error boundary retains a recovery message. The process list is a static map; selectable banners, object inspection and moving workers or equipment remain later packets. This is illustrative geometry, not manufacturer CAD.

From the workspace root, `node output/aircraft-demo/AD-02/check-geometry.mjs` checks generated buffers, completed dimensions, cockpit glass clearance, ordered process stages and fixture clearance (Node 24 used). AD-03 visual evidence and geometry-check.json are under `output/aircraft-demo/AD-03/`.

Local geometry review: `http://127.0.0.1:5174/?clearance` adds temporary 60 × 60 × 17 m wireframe envelopes. The normal URL has no envelopes. These are static size checks, not motion simulation. From the workspace root, `node output/aircraft-demo/AD-01-revision-1/check-clearances.mjs` regenerates current geometric check evidence (Node 24 used). The previous AD-01 check/evidence belongs to the superseded layout.
