# Example scenarios

These files are importable inputs for the simulation. In the app, open **Production results → Compare**, import a scenario, and run it. Save the current run as a baseline before importing a second scenario if you want to compare results. Use **Hard reset** to return to the built-in starting run.

| File | What it demonstrates |
|---|---|
| `baseline-24-orders.json` | Standard 24-order run over a 90-day horizon. |
| `engine-receipt-delay-3-days.json` | Delays one engine receipt by three days. Opening stock buffers this example, so output may remain unchanged. |
| `baseline-8-orders.json` | Smaller eight-order run for quicker exploration. |
| `engine-shortage-30-days-zero-receipt.json` | A severe stress case: one engine receipt is delayed 30 days and reduced to zero. It demonstrates a persistent material hold. |

These scenarios are synthetic examples, not operating plans or calibrated production forecasts. The stress case changes both the receipt date and quantity; it is not a delay-only comparison.
