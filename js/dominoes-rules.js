export function fits(tile, board, end, handNumber = 1) {
  if (!board?.length) return handNumber > 1 || (tile[0] === 6 && tile[1] === 6);
  const pip = end === 'left' ? board[0][0] : board.at(-1)[1];
  return tile.includes(pip);
}
export function canPlay(tile, board, handNumber = 1) { return fits(tile, board, 'left', handNumber) || fits(tile, board, 'right', handNumber); }
