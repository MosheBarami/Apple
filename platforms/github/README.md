# GitHub

Source control, pull requests and CI. It deploys nothing.

Repository: `MosheBarami/Apple` (public).

| Workflow | Triggers | Does |
|---|---|---|
| `.github/workflows/ci.yml` | push to `main`, every pull request, manual | typecheck, tests, site and web build with size and link budgets, plugin build and verification, static checks, secret scan (`scripts/checks/secret-scan.py`, full history), Playwright smoke |
| `.github/workflows/plugin-release.yml` | manual only | builds and verifies the plugin artifact; stops at the human publish step |

Rules the workflows hold themselves to (read the headers before editing):

- No job is given repository secrets, and no workflow file references `secrets.*`. A workflow with no
  credentials cannot leak or spend anything.
- Nothing in CI may call a paid model provider; every test that touches HTTP injects its own `fetchImpl`.
- A deploy step does not belong in `ci.yml`. If one is ever needed it goes in a separate workflow on `push: [main]`.
- `node scripts/checks/check-ci-references.mjs` fails when a workflow names a script that no longer exists.
- `node scripts/ci-parity.mjs` runs the same steps locally.

Repository settings (branch protection, secret scanning, branch clean-up, description, topics) are listed in
`docs/operations/REPO-CLEANUP-PENDING.md`; none were changed by the reorganisation.
