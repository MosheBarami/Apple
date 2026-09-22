# NEXT ACTION

**Ship the F-039 fix and re-run mission 1 (gameplay loop from a baseplate).** When workflow
`wf_46d0bb34-725` returns (review + fix of the BYOK track), run every suite, deploy the worker, web and
site together, verify `/api/health` serves the new build, then send "make a coin game!" again in the
paired Place1.rbxl (project Coin Rush 23 Sep) and read the place back: coins exist, touching one scores,
it respawns, the counter shows. Falsified if the run again reads more than 20 steps without a change, or
ends without coins.

Then: publish the component gallery for the owner; mobile QA; missions 2–5.
