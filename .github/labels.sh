#!/usr/bin/env bash
# Run once from the repo root: bash .github/labels.sh
set -e
mk(){ gh label create "$1" --color "$2" --description "$3" --force; }
mk bug           D73A4A "Something broken"
mk test-build    1F6FEB "Dev-set test build failed the bar"
mk style         C77DFF "Does not match the Style Bible"
mk task          0E8A16 "Milestone step"
mk owner-action  FBCA04 "Only the owner can do this"
mk dependencies  0366D6 "Dependency update"
mk later         BFD4F2 "Not blocking; after M7"
for m in M5a M5b M5c M5d W M6 M7; do mk "$m" EDEDED "Milestone $m"; done
for old in capability-gap benchmark "good first issue" "help wanted" javascript; do gh label delete "$old" --yes 2>/dev/null || true; done
