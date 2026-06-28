# Bug Log — Battleship (Human vs AI)

A record of the bugs found during development and how each was fixed. The original
build happened in Windsurf/Cascade (see `docs/cascade-history.md` for the full
conversation); the ship-graphics work was done afterward (see `docs/test-report.md`).

Each entry: **symptom → root cause → fix.**

---

## 1. Game wouldn't run when opened from the file system
- **Symptom:** Opening `index.html` directly in Chrome showed only the homepage; nothing was interactive.
- **Root cause:** `index.html` loaded the script as an ES module — `<script type="module" src="game.js">`. Browsers block module loading over the `file://` protocol for security, so the script never executed.
- **Fix:** Load it as a normal script: `<script src="game.js"></script>`.

## 2. Ship selection did nothing
- **Symptom:** Clicking a ship in the list didn't select it, so ships couldn't be placed.
- **Root cause:** A typo in the click handler — `() =>-selectShip(index)` — which is not a valid call.
- **Fix:** `shipItem.addEventListener('click', () => selectShip(index));`

## 3. "Start Game" after a win left the player board empty
- **Symptom:** After a game ended, clicking **Start Game** reset the enemy board but not the player board, so the game started with no player ships.
- **Root cause:** `startGame()` only partially reset state when the game was over.
- **Fix:** When `gameState.gameOver` is true, `startGame()` now calls `initializeGame()` and returns to the placement phase, forcing the player to place ships again before a new game can start.

## 4. Same ship type could be placed multiple times
- **Symptom:** Clicking e.g. "Carrier (5)" again let you place a second Carrier.
- **Root cause:** `selectShip()` didn't check whether that ship type was already placed.
- **Fix:** Guard in `selectShip()` — if a ship with the same name is already in `playerShips`, refuse selection and show a message.

## 5. AI stopped hunting after two hits
- **Symptom:** The AI would hit a ship, hit it again, then fire somewhere random instead of finishing it off.
- **Root cause:** After locking onto an orientation, `updateAITargeting()` didn't keep extending the target queue from the most recent hit.
- **Fix:** Always update `lastHit` to the latest hit and rebuild the target queue around it along the established orientation; only return to random firing when the ship is sunk or the queue is exhausted.

## 6. Buttons unresponsive / ship preview not showing
- **Symptom:** Start, Reset, and firing all stopped working, and the yellow placement preview disappeared.
- **Root cause:** A `ReferenceError: clearPreview is not defined` was thrown while wiring up event listeners, which aborted the rest of the setup so no handlers attached. (This was compounded by code accidentally deleted during a console.log cleanup — the `DOMContentLoaded` wrapper, `updateTurnIndicator()`, and the reset handler.)
- **Fix:** Added the missing `clearPreview()` function and restored the accidentally deleted code.

## 7. Ship-placement preview was offset from the cursor (the tricky one)
- **Symptom:** Hovering over **E1** to place a Carrier highlighted **F6–F10** (about 3 cells down and to the right); vertical placement highlighted a diagonal "staircase" (F6, G7, H8, …) instead of a straight line. Oddly, *clicking* placed the ship in the correct cells — only the preview was wrong.
- **Root cause:** The preview computed a cell's position in the DOM with a formula that assumed the row/column **labels** (A–J, 1–10) were part of the cell list — e.g. `(row + 1) * 11 + (col + 1)`, treating the board as 11×11. But the labels have a different CSS class (`label-cell`), and `querySelectorAll('.cell')` returns **only the 100 game cells**, in plain row-major order. The extra offsets pushed every preview cell off by a growing amount, which is why the error compounded into a staircase for vertical ships.
- **Fix:** Use simple 10×10 indexing, since the labels aren't in the `.cell` list:
  - horizontal: `cellIndex = row * 10 + (col + i)`
  - vertical: `cellIndex = (row + i) * 10 + col`

## 8. Ships were plain green blocks (enhancement)
- **Request:** Replace the flat green blocks with actual ship graphics.
- **Change:** Added SVG ship silhouettes drawn on an overlay above the board (Carrier with a flight deck, cruisers/battleship with turrets, submarine with a conning tower), oriented for horizontal/vertical placement; hit markers stay on top; enemy ships stay hidden until sunk/game over. Details and screenshots in `docs/test-report.md`.

---

### Lessons that recur in this log
- **`file://` is not a server.** ES modules, and some other browser features, behave differently when you double-click an HTML file vs. serve it over HTTP.
- **Know exactly what your DOM query returns.** Bug #7 came entirely from assuming `.cell` included label cells. When indexing into a `NodeList`, verify what's actually in it.
- **A thrown error stops everything after it.** One missing function (bug #6) silently broke every later event listener — check the browser console first when "nothing works."
