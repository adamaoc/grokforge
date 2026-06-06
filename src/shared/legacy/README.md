# Legacy Shared Agent Support

This folder holds older agent/harness contracts, helpers, and tests that are still referenced by compatibility UI or old support modules.

Code in here is not part of the minimal harness base. Treat it as a source of behavior to either delete or reintroduce through smaller, explicit contracts when rebuilding features such as plan mode, diff review, richer edit proposals, or historical harness evals.

Prefer importing root `src/shared/*` contracts for new work. Import from `src/shared/legacy/*` only when maintaining an old feature path.
