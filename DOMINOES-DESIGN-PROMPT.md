# Dominoes table design prompt

Redesign the live and admin Dominoes tables to feel like four friends sitting around an actual wooden table, following the approved second JPG mockup. Use a rich brown walnut surface, subtle natural grain, a slim dark wooden rim, warm lighting and ivory dominoes with black dot pips. Make the broad, rounded tabletop fill almost the entire available screen; keep navigation and status compact and minimize decorative space outside it.

Place the current player at the bottom, the next player on the left, the opposite player at the top and the remaining player on the right. Show compact initial avatars, names, scores, tile counts and a clear active-turn highlight. Keep opponents' tile faces concealed, with their hands near the perimeter. Put all seven of the current player's tiles in one readable row inside the bottom edge of the table, with no wrapping or clipping. Retain accessible labels, legal-play highlighting, end selection and passing.

Start the played chain vertically through the center. Extend its first end upward and its other end downward. Before reaching players' hands, turn the upper end left and the lower end right. If a branch reaches the side boundary, continue it along that outer side. Reserve clear space for player hands and seat labels. Adapt tile size to fit the complete 28-tile chain in the playing area on narrow screens, without scrolling the chain, overlapping tiles or hiding either endpoint. Keep the original opening tile as the anchor as tiles are added to either end.

Leave small visible gaps between dominoes. Add very minor hand-placed rotation and positional variation, while preserving clear chain order and readable pips. Keep those variations stable for each tile across turn updates and reconnects, rather than randomizing them on every render.

Use the same table renderer for normal play and admin testing. Keep reveal-all-hands and test controls outside the actual tabletop. Preserve Trumps, existing room/session/realtime behavior, current house rules, and GitHub Pages compatibility. Do not use the mockup as a flat screenshot background: the tiles and controls must remain interactive.
