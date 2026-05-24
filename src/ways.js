import { SYMBOLS, GAME_CONFIG, WAY_BET_DIVISOR } from './config.js';

export function isWild(symId) {
  const s = SYMBOLS.find(x => x.id === symId);
  return !!(s && s.isWild);
}

export function isScatter(symId) {
  const s = SYMBOLS.find(x => x.id === symId);
  return !!(s && s.isScatter);
}

export function countScatters(grid) {
  let count = 0;
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[r].length; c++) {
      if (isScatter(grid[r][c])) count++;
    }
  }
  return count;
}

export function evaluateWays(grid, totalBet) {
  const wins = [];
  let totalWin = 0;
  const payable = SYMBOLS.filter(s => !s.isScatter && !s.isWild);

  for (const target of payable) {
    const reelMatches = grid.map(reel => {
      const positions = [];
      for (let r = 0; r < reel.length; r++) {
        if (reel[r] === target.id || isWild(reel[r])) positions.push(r);
      }
      return positions;
    });

    let chain = 0;
    let waysCount = 1;
    const matchedCells = [];
    for (let i = 0; i < reelMatches.length; i++) {
      if (reelMatches[i].length === 0) break;
      chain++;
      waysCount *= reelMatches[i].length;
      reelMatches[i].forEach(row => matchedCells.push({ reel: i, row }));
    }

    if (chain >= 3) {
      const payoutMult = target.payouts[chain] || 0;
      if (payoutMult > 0) {
        const wayBet = totalBet / WAY_BET_DIVISOR;
        const winAmount = payoutMult * waysCount * wayBet;
        totalWin += winAmount;
        wins.push({
          symbol: target.id,
          chain,
          ways: waysCount,
          amount: winAmount,
          cells: matchedCells,
        });
      }
    }
  }

  // Scatter only triggers free spin — no direct payout (PG-style)
  const scatterCount = countScatters(grid);

  return { totalWin, wins, scatterCount };
}
