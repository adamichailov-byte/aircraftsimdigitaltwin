# Seeded experiments

Open **Production results → Experiments** to run replications in a separate worker using a frozen copy of the applied scenario. Experiments leave the live aircraft, clock, history, and comparison baseline intact. Results remain in the browser session until a scenario reset or reload. Nothing is sent to a backend.

The default simulation remains deterministic. Choose task-time variability and/or inventory delivery delays, select 1–30 replications and a starting seed, then run. The app lists the consecutive seeds. Running the same inputs and seeds reproduces the same outcomes. Existing inspection-failure settings still apply.

Task-time variation uses a triangular distribution from 0.8× to 1.2×, with 1.0× as the mode. Samples are stable per aircraft, task, and attempt. Delivery delay adds a discrete 0–3 calendar days per batch. Opening inventory, order releases, and quantities are not randomized. A delayed delivery may arrive beyond the run horizon and remain unusable during that run.

Random draws are keyed by the variability version, seed, and task or receipt identity. Adding work does not shift unrelated samples. Paired baseline and current experiments can use the same seed list and identity keys. Compare the shared assumptions and outputs before interpreting a delta.

Distributions report sample count and empirical p10, median, and p90. These are outcomes from the chosen synthetic model, not confidence intervals, fitted real-world distributions, forecasts, or staffing recommendations. Incomplete runs remain identified as incomplete and are not treated as completed horizon results.

Save experiment evidence to download the inputs, seeds, and outcomes. It is a record for reproducing the experiment, not an importable scenario or saved simulation checkpoint. All values remain synthetic and uncalibrated.
