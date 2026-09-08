# Ports

M0 defines `ClockPort`, which is exercised by the health use case.
M2 extends `JudgePort` with the active rubric and defines persistent Daily/session
operations in `PrimaryStorePort` plus cryptographic identifiers in `IdentityPort`.
Their contracts contain domain values and no provider/network types.
Comparison, auth, bot protection, and telemetry contracts will be introduced with
their first real consumers in the specified milestones.
Do not create empty interfaces or guess future vendor contracts.
