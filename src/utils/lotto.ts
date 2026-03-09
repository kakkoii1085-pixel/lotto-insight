// src/utils/lotto.ts
export type LottoGame = {
  numbers: number[]; // length 6, sorted asc
  sum: number;
  stddev: number;
};

export function generateOneGame(): number[] {
  const set = new Set<number>();
  while (set.size < 6) {
    const n = Math.floor(Math.random() * 45) + 1; // 1..45
    set.add(n);
  }
  return Array.from(set).sort((a, b) => a - b);
}

export function calcSum(nums: number[]): number {
  return nums.reduce((acc, v) => acc + v, 0);
}

// population stddev (모집단 표준편차)
export function calcStdDev(nums: number[]): number {
  const mean = calcSum(nums) / nums.length;
  const variance =
    nums.reduce((acc, v) => acc + (v - mean) ** 2, 0) / nums.length;
  return Math.sqrt(variance);
}

export function toLottoGame(nums: number[]): LottoGame {
  const sum = calcSum(nums);
  const stddev = calcStdDev(nums);
  return { numbers: nums, sum, stddev };
}

export type FilterConfig = {
  sumMin?: number;
  sumMax?: number;
  stdMin?: number;
  stdMax?: number;
};

export function passesFilters(game: LottoGame, f: FilterConfig): boolean {
  if (typeof f.sumMin === "number" && game.sum < f.sumMin) return false;
  if (typeof f.sumMax === "number" && game.sum > f.sumMax) return false;

  if (typeof f.stdMin === "number" && game.stddev < f.stdMin) return false;
  if (typeof f.stdMax === "number" && game.stddev > f.stdMax) return false;

  return true;
}

export function generateGames(
  count: number,
  filters: FilterConfig,
  maxAttempts = 50000
): { games: LottoGame[]; attempts: number } {
  const games: LottoGame[] = [];
  let attempts = 0;

  while (games.length < count && attempts < maxAttempts) {
    attempts += 1;
    const nums = generateOneGame();
    const game = toLottoGame(nums);

    if (!passesFilters(game, filters)) continue;

    // 같은 조합 중복 방지(선택)
    const key = game.numbers.join(",");
    const dup = games.some((g) => g.numbers.join(",") === key);
    if (dup) continue;

    games.push(game);
  }

  return { games, attempts };
}

export function formatForBlog(games: LottoGame[]): string {
  // 블로그 복붙용: 각 줄에 "1) 3 11 20 28 33 42 (합계: 137, 표준편차: 13.28)"
  return games
    .map((g, idx) => {
      const nums = g.numbers.join(" ");
      const sum = g.sum;
      const sd = g.stddev.toFixed(2);
      return `${idx + 1}) ${nums} (합계: ${sum}, 표준편차: ${sd})`;
    })
    .join("\n");
}