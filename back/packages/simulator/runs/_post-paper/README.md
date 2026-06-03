# Post-Paper Simulator Runs (historical)

Runs created after the first submission but before the corrected multi-auction pipeline. Like `_paper-snapshot`, this folder is `_`-prefixed and therefore **excluded** from the active pipeline (`dataset.ts` reads only non-underscore directories in the parent `runs/`).

Kept for provenance only. The current corpus is generated fresh into `runs/<uuid>/` by the multi-auction `run.ts`; train/eval read from there.
