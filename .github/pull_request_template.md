<!-- What changes and why. Link the issue: "Closes #123". -->

## Visual changes

<!--
UI changes need before/after visuals; the "PR visuals" check fails without
them.

Stills are the visual baselines this PR changes: the check keeps a "Visual
changes" comment with each changed screen, light and dark, before → after.
Update the baselines with the UI (once this PR's CI run has taken its
screenshots, run "Update visual baselines" on this branch, then approve the
checks its push starts).
A screen no baseline shows gets a scenario first
(e2e/screenshots/screens.yaml), so its picture guards the change from then
on.

Motion (swiping a card, an animation, a sheet or modal opening and closing,
scrolling, a multi-step flow) gets a GIF: add or edit its scenario (a
Maestro flow, e2e/gifs/<name>.yaml) and push. Once this PR's CI run finishes, the videos it recorded,
and main's, become GIFs, touches drawn, added at the end of this
description, labelled "GIF:"; each later push records them again in place (a
scenario that stopped early keeps its last GIFs, marked "Not updated"). Keep
the scenario on the branch: once the PR no longer changes it, its GIFs are
dropped. Running the "PR GIFs" workflow by hand, with this PR's number, is
the fallback: for every scenario, side by side, a failed run, or a fork's
PR, which is never attached on its own.

Only a still no test can draw (the app icon, the launch screen, an iOS prompt)
is dragged into this editor by hand, with alt text saying why:
![No test draws: the app icon](https://github.com/user-attachments/assets/…)
-->

- [ ] No visible UI change

## Validation

<!-- What you ran (make check, the Maestro flows you touched) and the tests you added. -->
