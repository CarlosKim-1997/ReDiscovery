# Domain

Pure content/play/reveal/identity rules belong here when their milestones start.
M0 supplies only the canonical vocabulary in `play/vocabulary.ts` and
`reveal/vocabulary.ts`: frozen string tuples and their derived literal union types.
These modules have no imports or framework/vendor dependencies.
M0 deliberately defines no game entities, policy, Judge schema, or content.
Dependencies may point only to this layer and pure `shared` utilities.
