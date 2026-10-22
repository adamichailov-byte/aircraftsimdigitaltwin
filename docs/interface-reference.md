# Interface reference

The simulation inputs, costs and process durations are synthetic. They are useful for demonstrating how queues and constraints interact; they are not calibrated to a particular manufacturer.

## Production report definitions

- The selected **From** and **Through** dates use the plant's local time zone and include both calendar dates. A report is clipped to the displayed simulation time. When history is selected, later computed events are excluded.
- Each completed aircraft belongs to the local calendar month of its delivery event. First and last months can be partial.
- **Opening WIP + admissions = deliveries + ending WIP.** Opening WIP is admitted aircraft not yet delivered immediately before the period. Released orders still waiting upstream are backlog, not WIP.
- Average flow time uses only aircraft delivered during the period with a recorded admission. Ending WIP shows unfinished age separately.
- Parts are consumed at **material issue**. Dock arrival, receipt inspection and reservations are not consumption. Each SKU keeps its own units; unlike kits and parts are not added together. “Already in opening WIP” means issues before the selected period for aircraft still in production at its start. “Of period issues to opening WIP” is shown separately.
- Station residence is partitioned by one primary status so concurrent jobs and blockers are not added twice. Productive work takes precedence. Otherwise the status order is off shift/break, equipment outage, missing material, unavailable resource, quality hold, daily start window, buffer before station transfer, transfer wait, and other residence. Elapsed cure, offsite flight and tow/tail-clear are separate categories. Material-held time counts otherwise idle staffed station time, not all clock hours during which a task has a material blocker.
- Station utilization is productive station time divided by scheduled staffed opportunity on shifts with crew and equipment capacity for at least one eligible job. Breaks are excluded; equipment outage stays in the denominator. A station with no opportunity displays N/A. This is not a measure of individual worker efficiency.

## Cost assumptions

Results → Costs shows the five-category ledger using applied rates, recorded material issues and the displayed cutoff. Scheduled labor includes idle time; its assigned/idle partitions are not added again. Materials are charged once at issue. WIP carrying and lateness accrue separately through delivery or the observed cutoff, including unfinished exposure. All rates are illustrative. See [the detailed cost assumptions](cost-assumptions.md) for rates, proration, due dates, overtime designations and source rules.

## Fleet and resource rules

- Aircraft start empty and follow the ordered task recipe. The first ready task is dispatched deterministically by readiness and serial. A source stays occupied until its tow tail clears; destination space, tug, qualified crew and conflicting corridor reservations must be available before a transfer starts.
- The fleet baseline has two weekday shifts, 06:00–14:00 and 14:00–22:00, with breaks from 10:00–10:30 and 18:00–18:30. There are 15 staffed hours per weekday; nights and weekends add no staffed work time.
- Daily jobs normally require 2–4 productive hours and start only if enough working time remains on that local date. Breaks and shift handovers can occur during a job. Unplanned outages may interrupt it; the remaining work is preserved. Cure and flight use elapsed time.
- Crews and equipment are finite shared capacity. A task obtains its full required bundle together or waits. Adding crew changes concurrency, not a task's duration. Assigned equipment may be retained through a shift pause according to its modeled policy.
- Aircraft remain unpainted through Bay 06, enter the paint enclosure nose-first, reverse out, then turn toward the flight line. A four-hour offsite acceptance flight retains its return stand. Delivery alternates between two stands.

## Inventory and deliveries

Inventory means stock currently on hand. An inventory delivery is an inbound batch, shown in the application data as a receipt. Opening inventory is usable unless quarantined. A delivery is unavailable until inspection, kitting, loading, travel and unloading complete. The forklift and shared route reservations stay occupied through the empty return. Breaks and nights pause its work. Delivered stock becomes usable at unloading completion, once. Material reservations are distinct from issues; releasing a reservation returns the stock.

Central stores is the modeled inventory destination. Distribution from stores to individual bays is abstracted. Rack fullness is a visual indicator relative to opening stock, capped for display; it is not a capacity limit or a literal count of physical parts. Aggregate kits represent quantities of work, not manufacturer part numbers.


The aircraft inspector shows current station tasks, progress, blockers, late work and task-level crew/equipment assignments. The Inventory view shows stock on hand and the status of scheduled incoming deliveries. Production results keep the selected period's totals and contributions visible.
