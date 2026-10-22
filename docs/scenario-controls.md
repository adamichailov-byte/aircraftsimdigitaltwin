# Using scenario controls

Open **Simulation settings** to edit a draft scenario. Changes take effect only after you apply and run them. Applying valid settings starts a new run from the plant's original start time and opening inventory. An invalid draft leaves the current run intact. The applied scenario shows its version, seed, and configuration fingerprint; the fingerprint identifies the inputs but is not a security signature.

## Supply

Choose a scheduled receipt and set its delay from 0 to 30 calendar days or its quantity from 0 to 200% of the original amount. The preview shows its new arrival and quantity. Only that receipt changes. Existing inventory, reservations, and consumed parts are not rewritten. A delayed receipt may have no effect when opening stock or another receipt covers demand. Zero quantity represents a real shortage.

## Resources and work

Named trade capacities range from 0 to 48 people per shift. Zero can stop work that needs that trade. Task-time factors range from 0.5× to 2× the selected base durations. Inspection failure probability ranges from 0 to 30%; the seed makes checks repeatable, with at most two modeled repair cycles. One equipment outage can be assigned to an existing resource for a bounded interval within the run.

These controls are scenario stress inputs, not calibrated estimates of factory performance or aircraft quality.

## Calendar

The plant uses America/New_York local time. Configure the two supported shifts, their breaks, and closed dates. Shifts and breaks must fit within a day without overlap. Closed dates must fall within the run. Calendar edits also reschedule working-day releases and replenishments. The model does not create work during a closure.

The default calendar has weekday shifts from 06:00–14:00 and 14:00–22:00, with breaks from 10:00–10:30 and 18:00–18:30. Most productive jobs are planned to fit within one working date. A disruption can still interrupt an active task; remaining work is retained for a later shift.

## Compare and reproduce

The application includes baseline and stress examples in [examples](../examples/README.md). Save scenario JSON to reproduce or share its inputs. Scenario files contain bounded settings and version information, not a saved simulation checkpoint or event history. No cloud storage or external file fetching is used.

All controls and outcomes are synthetic. A stress scenario is useful for understanding how the model responds, not for predicting a real plant.
