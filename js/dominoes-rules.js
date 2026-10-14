export function fits(tile, board, end) {
  if (!board?.length) return tile[0] === 6 && tile[1] === 6;
  const pip = end === 'left' ? board[0][0] : board.at(-1)[1];
  return tile.includes(pip);
}
export function canPlay(tile, board) { return fits(tile, board, 'left') || fits(tile, board, 'right'); }
