# Aircraft Manufacturing Digital Twin Demo

An interactive, standalone 3D concept model of a fictional aircraft final-assembly campus. It is a visual engineering and portfolio demo: the facility, aircraft, people, equipment, metrics, and movement are illustrative. It does not connect to a real factory, use manufacturer CAD, or require a backend.

## Run locally

Requires Node.js 22.12 or newer and a WebGL 2 capable browser.

```powershell
npm.cmd ci
npm.cmd run dev -- --host 127.0.0.1 --port 5175 --strictPort
```

Open the local URL printed by Vite. To check the project:

```powershell
npm.cmd run typecheck
npm.cmd run test:unit
npm.cmd run build
```

## Explore the model

- Drag to orbit; right-drag or Shift-drag to pan; scroll to zoom. Focus the scene and hold **W/A/S/D** to pan relative to your view. Arrow keys, **+ / −**, and **Home** also work.
- Use the compact **Options** menu for roofs, beams, buildings and reduced quality. Use **Guided tour** or the build sequence to focus a work area.
- Select a live aircraft in 3D or **Aircraft serial**. **Follow aircraft** tracks that serial; manual camera input releases tracking. **Recipe station** reviews work without moving the aircraft.

## Finite-capacity fleet with materials (AS-06)

The default starts empty on January 4, 2027 at06:00 America/New_York, with24 planned orders over90 local calendar days. There are three incoming spaces, a12-aircraft WIP limit, two transport tugs, finite station occupancy and exclusive conflicting tow corridors. Aircraft wait for downstream space. Admission waits upstream when capacity is unavailable. Dispatch is deterministic by readiness then serial.

**Play/Pause** and the three labeled simulated-time speeds use the same worker engine. **Next operation** skips calendar-only changes; **Run options → Next event** visits each event. **Run to horizon** calculates the full run with progress and cancellation. During bulk calculation the scene and inspector retain their last consistent snapshot; completion or cancellation commits the calculated snapshot. The progress date is separate from the displayed world date. Reset starts a new paused run; hiding the tab pauses playback without catch-up.

Choose **Run options → Show queue example** to slow Bay03 and calculate from an empty plant until Bay02 and Bay01 are both blocked. Select A100-002 or A100-003 to inspect the downstream aircraft preventing its transfer. **Baseline run** restores the normal fixture. These are named teaching fixtures, not a scenario editor.

Each persistent serial gains wings, tail, gear, engines and cabin only after prerequisite task completion. It remains primer through Bay06, enters paint nose-first and reverses out before turning toward acceptance. Bay03→04 uses north/west hangar doors and an exterior perimeter corridor. A four-hour offsite flight retains its return stand. Delivery uses two alternating assigned stands; final departure retires the visible actor while preserving its identity and history. **Step tow manoeuvre** inspects transfer phases.

The synthetic calendar has weekday06:00–14:00 and14:00–22:00 shifts, with half-hour breaks at10:00 and18:00. Working tasks and material handling preserve progress through closure; cure/flight and already-started aircraft tows use elapsed time. Materials, crews and shared equipment are finite. Costs, timeline/history scrubbing and a resource editor are not implemented yet. The earlier scripted production mode is no longer active.

## Material shortages and traceability

Stock starts with four of each aggregate kit and eight engines. Replenishment for four more aircraft arrives every eight working dates. Major-section kits bind to a serial at admission and issue at alignment; other requirements reserve and issue atomically at task start. Pausing work never consumes the kit again. Quarantined stock and stock awaiting handling cannot be used.

Choose **Run options → Show engine shortage** to calculate from an empty plant to A100-001 waiting in Bay04. Select that serial and inspect **Materials**: two engines needed, one available and one quarantined, none issued. **Step to receipt** reaches dock arrival; installation still waits for receiving and delivery. Other eligible work can continue while one task lacks parts. Only task completion adds the nacelles.

The Materials section shows per-task needed/available/reserved/issued quantities, dock arrival, bound lots and a collapsed plant ledger. Opening + received = on hand + issued + scrapped; reservations, quarantine and awaiting handling are subsets of on hand. A receipt beyond the run horizon remains an unfinished wait. With the daily-job policy, the90-day baseline delivers18 aircraft and retains six in production. These are synthetic scenario results, not manufacturer rates.

## Crew and equipment bottlenecks (AS-07)

Each task acquires its fixed-size crew and shared equipment bundle atomically before it starts. The inspector shows per-shift crew availability, shared equipment use, active assignments and resource waits. Crews release at shift boundaries and working tasks resume with their remaining time; configured elapsed work retains its equipment when required. Crew count limits concurrency, not task duration. These pools and qualifications are synthetic assumptions.

Choose **Run options → Show inspector bottleneck** to compare two ready inspections sharing a two-person quality pool. One inspection holds both inspectors while another waits with an explicit need/available message. Expand **Active assignments** and **Waiting for a resource** to see the serials and units. The same fixture also constrains admission with an intentionally small WIP limit; use **Baseline run** to return to the standard capacities. Station crane, hoist and paint-head motion now follows the matching work task's progress and returns to standby when the task pauses or completes.

## Daily jobs after the plant-tour critique

The full recipe contains 61 staffed jobs of 2–4 productive hours, nine station-to-station/departure tows, and elapsed cure and flight. Fleet admission adds the incoming tow. Engine work, for example, now has separate jobs to position engines, secure mounts, and connect services. Wiring and hydraulics have individual forward, aft and wing-area jobs; those two installation streams can still run in parallel. Each group retains its original total effort and fixed crew requirements.

Daily jobs start only when the productive time left on that local date covers the job. A late-ready job shows **Next workday** and its required/available hours; it consumes no kit or crew lease while waiting for its daily window. Breaks and shift handovers can occur within the day. Unplanned interruptions may still cause an overrun and retain the actual remaining work. Cure, flight and already-started tows continue to follow elapsed time.

Each group issues its kit once at the first job; the aircraft's installed-parts milestone follows the last closeout job. The inspector, master schedule and flow timeline use these same detailed jobs. The timeline records daily-window waits as off-shift intervals, distinct from red material/resource holds. These are synthetic work packages informed by the owner's observation, not a manufacturer's released work instructions.

## Receiving and usable kits (AS-08)

Open **Run options → Follow delayed engine kit**. The single-aircraft fixture pauses at Jan25 06:00 dock arrival, with7 new engines still unavailable and the aircraft waiting for its second usable engine. Inspection is explicitly delayed until11:00. **Receiving** opens the same right workspace with receipt selection, handling state, blockers, stock and assigned crew. **Follow forklift / load** tracks the carrier; **Next handling event** and **Advance 1 minute** let you inspect progress while paused.

Each receipt lot needs2 working hours of inspection with2 logistics crew,1 working hour of kitting with1 crew,5-minute load and unload dwells, and travel at2m/s. The single forklift follows the existing receiving west door, paved service roads and stores east door. Aircraft crossing locks are shared and held conservatively for the full round trip. Breaks and nights freeze forklift and load together; the driver releases while the forklift and corridor reservations stay held. Unloading changes usable destination stock exactly once; its empty return changes no stock. In the delayed fixture the drop and A100-001 engine-install start both occur Jan25 14:20:50.500.

The scene shows one aggregate crate per visible job, assigned receiving crew and an active forklift driver. Rack fullness reflects aggregate available stock relative to the opening buffer, visually capped; it is not a physical capacity limit or a literal part count. Replenishment drops in central stores; onward bay distribution is abstracted. Legacy delivery loops are not mounted in fleet mode. Red aircraft warning markers remain clickable and open the matching aircraft's alert and task information.

## What is modeled

### Shared schedule and forklift queue (AS-08a)

**Receiving → Job queue** lists all planned receipts, including future arrivals, their handling stage and blockers. At the baseline start the forklift is legitimately idle: opening inventory is already available, and its first receiving trip follows the Jan14 replenishment. It is not an arbitrary animation loop. **Follow current assignment** tracks its real load; use the slowest playback speed or **Advance 1 minute** to see a short trip.

Open **Master schedule** at the bottom for aircraft tasks and tows, receiving stages, required crews/tools, planned dates and actual starts/completions. Filter equipment assignments and search `kit-forklift`, `wing-crane`, a serial or a crew pool. Plans are calculated in a separate background worker using the same finite-capacity dispatcher, calendar, inventory, routes and station reservations. Actual work can run while the plan builds. Forecast results never populate actual state or history.

The baseline freezes current run inputs. Teaching disruptions explicitly use a **nominal capacity plan**: same orders and receipt dates, standard task durations/crew capacity, and inspection allowed at arrival; quarantine remains. Missed starts or finishes become red alerts with links to the affected aircraft or receiving job. Completed late work remains marked. Targets do not move as execution slips; reset builds a new plan. **Follow delayed engine kit → Advance 1 minute** demonstrates an overdue inspection at Jan25 06:01, against its06:00 target. These are synthetic planning targets, not a factory promise or an optimization solver. Task rows list resource requirements; retained tool leases can span pauses. Bay-side kit distribution remains abstracted.

The campus centers on one large square production hall where all aircraft assembly takes place. It includes six work areas, receiving and kitting, parts storage, supporting buildings, inbound logistics, and an aircraft apron with dedicated checks and delivery stands. Taxi and apron markings guide the illustrated tow from the paint bay toward checks and the delivery stand.

The production recipe follows fuselage and wing assembly, systems, landing gear and engines, cabin fit-out, pre-paint ground checks, paint, flight-line acceptance, offsite flight test and delivery. Receiving and central stores participate in receipt handling; rail and cargo transport are contextual. Multiple aircraft occupy stages according to the fleet engine. All dimensions and process durations are synthetic teaching assumptions, not verified factory data.

The aircraft is an original fictional A-100 model. Geometry and roles are simplified for a readable demonstration and are not manufacturer CAD or engineering release data. See [ASSETS.md](ASSETS.md) for asset authorship and attribution.

## Local rendering measurements

For repeatable developer measurements, add `?profile=1` to the local URL. **Measure overview** and **Measure Bay02** pause the current fleet at its displayed instant, warm up for 5 seconds, and sample complete frame intervals for 30 seconds. The overview uses a fixed orbit; Bay02 uses a fixed close view. Samples stop if the tab becomes hidden. **Toggle shadows** isolates shadow cost without changing resolution. Normal viewing has no diagnostics panel.

Use a production build (`npm.cmd run build`, then `npm.cmd run preview -- --host 127.0.0.1 --port 5175 --strictPort`) and a consistent viewport/quality setting for comparisons. The reported first rendered frame is a local readiness observation, not a network or production load guarantee. Selecting a measurement leaves playback paused; use Play to resume the fleet. The profile view also exposes a run fingerprint for developer comparisons.
