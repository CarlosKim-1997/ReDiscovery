# Ports

M0 defines `ClockPort`, which is exercised by the health use case.
M1 adds the minimum `JudgePort` and `PrimaryStorePort` used by the deterministic
walking skeleton. Their contracts contain domain values and no provider/network types.
Comparison, auth, bot protection, and telemetry contracts will be introduced with
their first real consumers in the specified milestones.
Do not create empty interfaces or guess future vendor contracts.
