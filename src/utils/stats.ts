import { calcSum, calcStdDev } from "./lotto";

export function calcFrequency(history: number[][]) {
  const freq = Array.from({ length: 46 }, () => 0); // 0~45, 0은 unused
  for (const draw of history) {
    for (const n of draw) freq[n] += 1;
  }
  return freq;
}

export function getTop(freq: number[], k = 10) {
  const arr = [];
  for (let n = 1; n <= 45; n++) arr.push({ n, count: freq[n] });
  arr.sort((a, b) => b.count - a.count || a.n - b.n);
  return arr.slice(0, k);
}

export function getBottom(freq: number[], k = 10) {
  const arr = [];
  for (let n = 1; n <= 45; n++) arr.push({ n, count: freq[n] });
  arr.sort((a, b) => a.count - b.count || a.n - b.n);
  return arr.slice(0, k);
}

export function calcAverages(history: number[][]) {
  if (history.length === 0) return { avgSum: 0, avgStd: 0 };

  const sums = history.map((d) => calcSum(d));
  const stds = history.map((d) => calcStdDev(d));

  const avgSum = sums.reduce((a, b) => a + b, 0) / sums.length;
  const avgStd = stds.reduce((a, b) => a + b, 0) / stds.length;

  return { avgSum, avgStd };
}