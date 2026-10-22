# Modeled cost ledger

All rates are illustrative author assumptions, uncalibrated to a manufacturer. The ledger is a cost model, not financial accounting, contractual penalties, profit, or lost revenue. Total simulated cost does not equal delay cost.

## Rates and units

| Category | Default | Quantity source |
|---|---|---|
| Scheduled labor | $60 / person-hour | Shift staffing × calendar working time, excluding breaks |
| Overtime premium | $30 / overtime person-hour above base | Same paid time only for explicitly designated overtime shift labels |
| Consumed materials | $1,000 / aggregate kit; $10,000 / engine | Unique material-issued postings and their SKU/lot quantities |
| WIP carrying | $100 / aircraft / 24 elapsed hours | Admission to delivery, clipped to observed report time |
| Accrued lateness | $500 / aircraft / 24 elapsed hours | Due date to delivery, clipped to observed report time |

The default two shifts are regular shifts: no overtime premium is charged. An overtime designation adds only its premium; base labor already includes those scheduled people. This model has no payroll identity or inferred weekly overtime threshold.

Each material type has its own explicit rate in the scenario settings. Engine quantities are individual engines; other quantities are aggregate kits. Missing SKU rates cause an error rather than silently treating material as free. All listed kits share the illustrative $1,000 starting rate; this is an arithmetic convenience, not a valuation.

Rates are nonnegative integer USD cents in the scenario's `costRates`. Simulation settings edit the hourly/daily/SKU rates before Apply & restart. An authored scenario can designate `overtimeShiftLabels`, override each order's `dueAt`, or use the default release + 35 local calendar days. Local date addition retains the plant time through daylight saving; carrying/lateness dollars prorate by elapsed milliseconds / 86,400,000. Therefore a 23-hour local date contributes 23/24 of a charge day.

## No duplicate charges

Paid scheduled labor includes assigned and idle capacity. Their amounts partition the base charge; they are not extra categories. Rework uses that same finite capacity and affects utilization without adding another paid charge. An extra paid schedule would change base cost; a designated overtime schedule also adds its premium. Assigned labor includes receiving/handling and tow leases, not just assembly work.

Parts are charged at issue, once per material posting. Receipt, reservation, installation completion, and replay do not add purchase or issue costs. A separate replacement material issue would be a real additional consumption.

WIP carrying excludes raw stock and unreleased/upstream orders. Lateness includes released overdue orders that have not yet been admitted as well as unfinished admitted aircraft. Delivered orders stop both accruals at delivery. Unfinished amounts are displayed as included exposure, never added again or extrapolated to an unknown finish.

## Date filters, rounding and audit

Results use the selected plant-local dates, capped at the displayed scene/history cutoff. Materials use [from, to) issue instants. Continuous charges accrue to the boundary and use rounded cumulative endpoint differences, so adjacent date ranges reconcile. Each shift, aircraft carrying interval, aircraft lateness interval, and issue/SKU is a stable posting. Integer arithmetic rounds half up to cents at posting; amounts do not depend on playback frames or how many times the report is opened. Displayed quantities are abbreviated; the ledger uses exact integer milliseconds.

Click a category amount to see its aircraft/shift records, then a record amount to see its source event IDs or scenario/calendar source, quantity, rate version, and timestamps. Plant-wide paid capacity is not arbitrarily allocated to aircraft. A late-aircraft example is 12 elapsed hours × $500 / 24 hours = $250. Two engines × $10,000 = $20,000. Two scheduled people × two hours × $60 = $240, including any idle time.

Remaining exclusions: equipment depreciation, taxes, procurement cash flows, inventory carrying before aircraft admission, profit, revenue, and contractual damage calculations. Lower material consumption may simply mean fewer aircraft progressed; it is not evidence of a better outcome. Compare deliveries and unfinished WIP alongside costs.
