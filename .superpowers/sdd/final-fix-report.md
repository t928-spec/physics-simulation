# Final review fixes

Status: All six requested findings addressed.

## Changes

1. CO2 internal displacements use oxygen/carbon masses 16/12. Both oxygens move together in antisymmetric stretch and each perpendicular bend; carbon moves oppositely with the 2 mO / mC amplitude ratio. Each internal vibration keeps the mass center stationary.
2. Coordinates now apply internal vibration in the molecular frame, followed by rigid rotations, then laboratory translation. Rotations cannot rotate the translation vector, and stretches rotate with the molecular axis.
3. The HTML loads the shared core as a classic local script. The core exposes a namespaced browser API and CommonJS exports to Node, so the browser and tests share one implementation with no copied model or build step. README direct-file instructions remain valid.
4. The legend begins a fresh canvas path before its rounded rectangle.
5. Axes and translation arrows use the same projected unit vectors as atoms. Positive z points down and right for both the axis and the tz marker.
6. The homepage card follows its neighboring cards' multiline HTML style.

## Verification

- TDD red: added focused regressions before production changes; 8 tests failed for the expected mass-center, transform, file-loader, canvas-path, and projection defects. The symmetric-stretch baseline already passed.
- TDD green: `node --test tests/*.test.mjs` passed all 26 tests (18 molecular, 8 existing string-wave), zero failures.
- The classic-script test executes the shared core without any module loader and compares its API result with the Node-tested API.
- Drawing tests execute the real drawing functions with a recording canvas context, checking fresh legend paths and positive-z arrow vectors against the actual projection.
- `git diff --check` passed. Git emitted only repository line-ending normalization notices (LF to CRLF), not whitespace errors.

## Limits and handoff

No interactive browser smoke test was performed by this fix agent. The parent agent was notified that the worktree is ready for direct `file://` browser verification. Existing untracked `.superpowers` review material was preserved; only this report was added to the fix commit.
