export type LottoDraw = {
  round: number;
  date: string;
  numbers: number[];
  bonus: number;
};

export async function loadHistory(): Promise<LottoDraw[]> {
  const response = await fetch("/lotto_1_1213_numbers.csv");
  const csvText = await response.text();

  const lines = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length <= 1) return [];

  const rows = lines.slice(1);

  const parsed = rows
    .map((line) => {
      const cols = line.split(",");

      if (cols.length < 9) return null;

      const round = Number(cols[0]);
      const date = cols[1];
      const numbers = cols.slice(2, 8).map((v) => Number(v));
      const bonus = Number(cols[8]);

      if (
        Number.isNaN(round) ||
        numbers.some((n) => Number.isNaN(n)) ||
        Number.isNaN(bonus)
      ) {
        return null;
      }

      return {
        round,
        date,
        numbers,
        bonus,
      };
    })
    .filter((item): item is LottoDraw => item !== null)
    .sort((a, b) => a.round - b.round);

  return parsed;
}