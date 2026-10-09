# UAT 2026-10-09-611-before

Base http://localhost:8140, 375x812. Written by scripts/uat.mjs.

| # | Step | Result | Read off the page | Shot |
|---|---|---|---|---|
| 01 | Plan next week for a patient with nothing yet lists the therapies to tick and books them on every day | FAIL | TimeoutError: locator.click: Timeout 30000ms exceeded. Call log:   - waiting for getByRole('dialog').last().getByRole('switch').first() | ![01](01.png) |
