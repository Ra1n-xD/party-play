# Card game controls and motion implementation plan

1. Add shared card visual-event contracts and expose bounded Durak/UNO runtime events in public projections without hidden card data.
2. Record accepted player actions and every relevant card transfer in Durak and UNO engines.
3. Add reusable client hooks for transfer flights and transient player-action indicators.
4. Extract bottom rules/reaction tools from the room header and place them in all Bunker, Durak, and UNO command/result bars.
5. Add motion anchors and action bubbles to Durak/UNO screens.
6. Rework responsive card-game CSS: larger desktop table/trump cards, centered UNO piles and hands, six-player mobile grids, and non-scrolling fanned hands.
7. Format, build, inspect the diff, then verify desktop/mobile behavior through the in-app browser.
