# Fruit Slash Academy · 折舊切切樂

An offline HTML5 fruit-slashing game for Hong Kong Secondary 5 BAFS accounting lessons. Students practise cutting fruit, then use the same interaction to explore three depreciation methods.

The game uses HTML, CSS, JavaScript and Canvas. Its artwork and sound effects are generated locally, with no external assets, CDN, backend or account requirement.

## Getting started

Download the project and open `index.html` in a modern browser. Keep these six files in the same folder:

```text
index.html
style.css
game.js
accounting.js
fruit-art.js
ui-art.js
```

No installation or internet connection is required to play. Use a mouse, finger or stylus: hold down and swipe through the fruit. A click alone does not count as a cut.

## Uploading this folder to GitHub

Upload the contents of this folder to your repository, keeping `index.html` and its five supporting files together at the repository root. All fruit illustrations, interface artwork and sound assets are included in the JavaScript files; there is no separate image or audio download.

The `tests/` folder and documentation are included for development and reference. They are not required to play the game.

## Learning flow

1. **Free play:** finish a complete warm-up round to unlock Straight-line Depreciation. The default round lasts 35 seconds after a three-second countdown.
2. **Straight-line Depreciation:** complete all four annual cuts to unlock the other two methods. Entering the lesson or leaving halfway through does not unlock them.
3. **Further lessons:** choose Reducing-balance Depreciation or Usage-based Depreciation.

Each lesson introduces its case **one fact at a time**. Swipe through a case card to reveal the next fact; cut the final card to enter the cutting screen. Straight-line, reducing-balance and usage-based lessons contain eight, six and five cards respectively.

During cutting, the screen shows the current task, year, remaining value and fruit. Formulas and the full depreciation table appear on the results page.

## Game features

- Six original fruit types, split-fruit animation, juice particles, a glowing swipe trail and sound effects.
- Free-play scoring: **+10 points per fruit**. Cutting three fruit in one stroke earns a **+20-point bonus**, with another +20 for each additional fruit in that stroke.
- Bombs appear after the opening practice window and become more frequent. Hitting one deducts **50 points**, stops the combo and briefly interrupts the blade. Scores cannot fall below zero; release before starting a new stroke.
- Completing the whole free-play timer unlocks the first lesson, with no minimum score. Teaching lessons contain no bombs.
- Pause/resume controls and automatic pausing when the browser loses focus.
- Progress, completed lessons and the best score are saved in the current browser.
- Teacher settings for **20 / 35 / 60 seconds**, sound, cutting guides and progress reset.
- A responsive interface with original fruit illustrations, pastel mode cards, clear case cards and completion badges.

## Depreciation examples

| Method | Case | Annual depreciation | Final carrying amount |
| --- | --- | --- | --- |
| Straight-line | Cost $54,000; residual $6,000; four years | $12,000 each year | $6,000 |
| Reducing-balance | Cost $160,000; residual $10,000; four calculation years; 50% rate | $80,000 / $40,000 / $20,000 / $10,000 | $10,000 |
| Usage-based | Cost $54,000; residual $6,000; estimated total usage 12,000 | $12,000 / $18,000 / $0 / $18,000 | $6,000 |

Straight-line cost includes purchase price $48,000, transport $2,000 and installation $4,000. The usage-based rate is $4 per use, with annual usage of 3,000 / 4,500 / 0 / 4,500. The zero-usage year advances automatically without a cut.

The reducing-balance case shows calculations for 2026–2029 only. It reaches the $10,000 residual-value floor after the fourth annual charge and then finishes, without an extra zero-depreciation year. Total depreciation is $150,000; carrying value never falls below $10,000.

Fruit represents the allocation of asset cost, rather than resale price. Residual value is retained. The **straight-line cutting screen keeps its original red fruit and green rectangular residual area**. Only its completed results page uses a **watermelon-rind illustration** to show the retained $6,000.

## Project files

| File | Purpose |
| --- | --- |
| `index.html`, `style.css` | Interface and responsive layout |
| `game.js` | Game states, swipe input, animation, audio and saved progress |
| `accounting.js` | Depreciation calculations and unlock rules |
| `fruit-art.js` | Fruit, cut surfaces, bombs and the result-page rind |
| `ui-art.js` | Responsive menu illustration |
| `tests/` | Development test scripts and recorded reports |
| `README.md` | English project summary and upload instructions |
| `README.zh-HK.md` | Detailed Traditional Chinese playing instructions |
| `TEST-RESULTS.md` | Verification details and test limitations |

## Verification

The reducing-balance tests cover the updated cost, 50% rate, four annual cuts and $10,000 retained, including desktop and phone-sized browser runs. See `TEST-RESULTS.md` for the latest recorded checks.

Recorded checks include 14 calculation/unlock tests, 19 full game-flow checks, 22 unlock and saved-progress checks, and 23 checks confirming the original cutting artwork and result-only rind. Earlier checks cover bombs, sequential case cards, five-year depreciation and responsive layouts.

Testing used desktop Chrome with browser-controlled clocks, pointer events and desktop/mobile viewport sizes. Physical mobile devices, Apple Pencil and Safari have not been verified.

To run the calculation tests:

```sh
node --test tests/accounting.test.cjs
```

Browser tests require Node.js, Playwright and a supported local browser; these are development dependencies only. See `TEST-RESULTS.md` for the individual test commands.
