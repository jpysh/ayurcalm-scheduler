# UAT 2026-10-08-487-before

Base http://localhost:8150, 375x812. Written by scripts/uat.mjs.

| # | Step | Result | Read off the page | Shot |
|---|---|---|---|---|
| 01 | What needs you lists the follow-up due today | FAIL | TimeoutError: locator.click: Timeout 5000ms exceeded. Call log:   - waiting for getByRole('dialog').last().getByRole('button', { name: /need you/ }) | ![01](01.png) |
| 02 | The card opens Follow-up with WhatsApp and Mark done | FAIL | TimeoutError: locator.click: Timeout 5000ms exceeded. Call log:   - waiting for getByRole('dialog').last().getByRole('button', { name: /need you/ }) | ![02](02.png) |
