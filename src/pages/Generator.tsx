import { useEffect, useMemo, useState } from "react";

type LottoRow = {
  round: number;
  date: string;
  numbers: number[];
  bonus: number;
};

type ConsecutiveMode = "allow2_block3" | "block2plus" | "free";
type RecentExcludeRound =
  | 1
  | 2
  | 3
  | 4
  | 5
  | 6
  | 7
  | 8
  | 9
  | 10
  | 20
  | 30
  | 40;

type ScoreItem = {
  label: string;
  score: number;
};

type SavedSetItem = {
  id: string;
  numbers: number[];
  score?: number | null;
  scoreLabel?: string | null;
  createdAt?: number;
  applyDate?: string | null;
  source?: "generator" | "simulator" | string;
};

type EvaluatedSet = {
  numbers: number[];
  displayText: string;
  overallScore: number;
  scoreItems: ScoreItem[];
  isNew: boolean;
  isSaved: boolean;
  isJustSaved: boolean;
};

const STORAGE_KEY = "savedNumbers";
const LEGACY_STORAGE_KEY = "savedLottoSets";

function getBallClass(num: number) {
  if (num <= 10) return "ball yellow";
  if (num <= 20) return "ball navy";
  if (num <= 30) return "ball red";
  if (num <= 40) return "ball gray";
  return "ball green";
}

function shuffle<T>(arr: T[]) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function getSetKey(nums: number[]) {
  return [...nums].sort((a, b) => a - b).join("-");
}

function getMaxConsecutiveRun(nums: number[]) {
  const sorted = [...nums].sort((a, b) => a - b);
  let maxRun = 1;
  let currentRun = 1;

  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i] === sorted[i - 1] + 1) {
      currentRun += 1;
      maxRun = Math.max(maxRun, currentRun);
    } else {
      currentRun = 1;
    }
  }

  return maxRun;
}

function getStdDev(nums: number[]) {
  const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
  const variance =
    nums.reduce((acc, num) => acc + Math.pow(num - mean, 2), 0) / nums.length;
  return Math.sqrt(variance);
}

function formatSet(set: number[]) {
  return [...set].sort((a, b) => a - b).join(", ");
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((acc, cur) => acc + cur, 0) / values.length;
}

function getOddCount(nums: number[]) {
  return nums.filter((n) => n % 2 === 1).length;
}

function getLowCount(nums: number[]) {
  return nums.filter((n) => n <= 22).length;
}

function getGapAverage(nums: number[]) {
  const sorted = [...nums].sort((a, b) => a - b);
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i += 1) {
    gaps.push(sorted[i] - sorted[i - 1]);
  }
  return average(gaps);
}

function getDecadeBucketCount(nums: number[]) {
  const buckets = [0, 0, 0, 0, 0];
  nums.forEach((n) => {
    if (n <= 10) buckets[0] += 1;
    else if (n <= 20) buckets[1] += 1;
    else if (n <= 30) buckets[2] += 1;
    else if (n <= 40) buckets[3] += 1;
    else buckets[4] += 1;
  });
  return buckets.filter((v) => v > 0).length;
}

function ratioKey(a: number, b: number) {
  return `${a}:${b}`;
}

function getCenterClosenessScore(
  value: number,
  center: number,
  tolerance: number,
  minScore = 25
) {
  if (tolerance <= 0) return 100;
  const diff = Math.abs(value - center);
  const raw = 100 - (diff / tolerance) * 100;
  return clamp(Math.max(minScore, raw));
}

function getPatternFrequencyScore(
  key: string,
  patternMap: Record<string, number>,
  totalCount: number
) {
  if (totalCount <= 0) return 60;
  const count = patternMap[key] || 0;
  const ratio = count / totalCount;

  if (ratio >= 0.2) return 100;
  if (ratio >= 0.16) return 94;
  if (ratio >= 0.12) return 86;
  if (ratio >= 0.08) return 74;
  if (ratio >= 0.05) return 62;
  if (ratio >= 0.03) return 50;
  return 38;
}

function getRecentHeatPenaltyScore(
  nums: number[],
  recentFrequencyMap: Record<number, number>
) {
  const totalHeat = nums.reduce(
    (acc, num) => acc + (recentFrequencyMap[num] || 0),
    0
  );

  if (totalHeat <= 2) return 100;
  if (totalHeat <= 4) return 92;
  if (totalHeat <= 6) return 82;
  if (totalHeat <= 8) return 70;
  if (totalHeat <= 10) return 58;
  return 42;
}

function getFrequencyBalanceScore(
  nums: number[],
  allFrequencyMap: Record<number, number>,
  expectedFrequency: number
) {
  const picked = nums.map((num) => allFrequencyMap[num] || 0);
  const avgFreq = average(picked);
  return getCenterClosenessScore(
    avgFreq,
    expectedFrequency,
    Math.max(2, expectedFrequency * 0.65),
    30
  );
}

function getDecadeSpreadScore(nums: number[]) {
  const usedBucketCount = getDecadeBucketCount(nums);
  if (usedBucketCount >= 4) return 100;
  if (usedBucketCount === 3) return 82;
  if (usedBucketCount === 2) return 60;
  return 38;
}

function getConsecutiveStructureScore(maxRun: number, mode: ConsecutiveMode) {
  if (mode === "free") {
    if (maxRun === 1) return 94;
    if (maxRun === 2) return 100;
    if (maxRun === 3) return 76;
    return 54;
  }

  if (mode === "allow2_block3") {
    if (maxRun === 1) return 94;
    if (maxRun === 2) return 100;
    if (maxRun === 3) return 36;
    return 24;
  }

  if (mode === "block2plus") {
    if (maxRun === 1) return 100;
    if (maxRun === 2) return 28;
    return 18;
  }

  return 80;
}

function getScoreLabel(score: number | null | undefined) {
  if (score == null || Number.isNaN(score)) return "미평가";
  if (score >= 90) return "매우 높음";
  if (score >= 80) return "높음";
  if (score >= 70) return "양호";
  if (score >= 60) return "보통";
  return "낮음";
}

function formatDateToYmd(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getNextSaturdayString(baseDate?: number) {
  const date = baseDate ? new Date(baseDate) : new Date();
  date.setHours(12, 0, 0, 0);

  const day = date.getDay();
  const diff = (6 - day + 7) % 7;
  date.setDate(date.getDate() + diff);

  return formatDateToYmd(date);
}

function normalizeNumbers(value: unknown): number[] {
  if (!Array.isArray(value)) return [];

  const nums = value
    .map((v) => Number(v))
    .filter((v) => Number.isFinite(v) && v >= 1 && v <= 45)
    .sort((a, b) => a - b);

  return Array.from(new Set(nums));
}

function normalizeSavedItem(raw: unknown, index: number): SavedSetItem | null {
  if (Array.isArray(raw)) {
    const nums = normalizeNumbers(raw);
    if (nums.length !== 6) return null;

    const createdAt = Date.now() - index;

    return {
      id: `${Date.now()}_${index}_${getSetKey(nums)}`,
      numbers: nums,
      score: null,
      scoreLabel: null,
      createdAt,
      applyDate: getNextSaturdayString(createdAt),
      source: "generator",
    };
  }

  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    const nums = normalizeNumbers(
      obj.numbers ?? obj.nums ?? obj.selectedNumbers
    );

    if (nums.length !== 6) return null;

    const scoreValue =
      obj.score === 0 || obj.score
        ? Number(obj.score)
        : obj.overallScore === 0 || obj.overallScore
        ? Number(obj.overallScore)
        : null;

    const createdAt =
      typeof obj.createdAt === "number"
        ? obj.createdAt
        : typeof obj.createdAt === "string"
        ? new Date(obj.createdAt).getTime() || Date.now() - index
        : Date.now() - index;

    return {
      id:
        typeof obj.id === "string" && obj.id.trim()
          ? obj.id
          : `${Date.now()}_${index}_${getSetKey(nums)}`,
      numbers: nums,
      score:
        scoreValue != null && Number.isFinite(scoreValue)
          ? Math.round(scoreValue)
          : null,
      scoreLabel:
        typeof obj.scoreLabel === "string"
          ? obj.scoreLabel
          : typeof obj.gradeLabel === "string"
          ? obj.gradeLabel
          : scoreValue != null && Number.isFinite(scoreValue)
          ? getScoreLabel(Math.round(scoreValue))
          : null,
      createdAt,
      applyDate:
        typeof obj.applyDate === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(obj.applyDate)
          ? obj.applyDate
          : getNextSaturdayString(createdAt),
      source:
        typeof obj.source === "string" && obj.source.trim()
          ? obj.source
          : "generator",
    };
  }

  return null;
}

function readSavedSetsFromStorage(key: string): SavedSetItem[] {
  try {
    const stored = localStorage.getItem(key);
    const parsed = stored ? JSON.parse(stored) : [];
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((item, index) => normalizeSavedItem(item, index))
      .filter(Boolean) as SavedSetItem[];
  } catch {
    return [];
  }
}

function loadInitialSavedSets(): SavedSetItem[] {
  const merged = [
    ...readSavedSetsFromStorage(STORAGE_KEY),
    ...readSavedSetsFromStorage(LEGACY_STORAGE_KEY),
  ];

  const map = new Map<string, SavedSetItem>();

  merged.forEach((item) => {
    const key = `${getSetKey(item.numbers)}-${item.source ?? "generator"}`;
    if (!map.has(key)) {
      map.set(key, item);
    }
  });

  return Array.from(map.values()).sort(
    (a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0)
  );
}

export default function Generator() {
  const [rows, setRows] = useState<LottoRow[]>([]);
  const [gameCount, setGameCount] = useState(5);

  const [oddMin, setOddMin] = useState(2);
  const [oddMax, setOddMax] = useState(4);

  const [lowMin, setLowMin] = useState(2);
  const [lowMax, setLowMax] = useState(4);

  const [sumMin, setSumMin] = useState(115);
  const [sumMax, setSumMax] = useState(165);

  const [stdMin, setStdMin] = useState(10);
  const [stdMax, setStdMax] = useState(16);

  const [consecutiveMode, setConsecutiveMode] =
    useState<ConsecutiveMode>("allow2_block3");
  const [excludePastWinning, setExcludePastWinning] = useState(true);
  const [useRecentExclude, setUseRecentExclude] = useState(false);
  const [recentExcludeRound, setRecentExcludeRound] =
    useState<RecentExcludeRound>(10);

  const [includeNumbers, setIncludeNumbers] = useState<number[]>([]);
  const [excludeNumbers, setExcludeNumbers] = useState<number[]>([]);
  const [generatedSets, setGeneratedSets] = useState<number[][]>([]);
  const [newSetKeys, setNewSetKeys] = useState<string[]>([]);
  const [savedFlashKeys, setSavedFlashKeys] = useState<string[]>([]);
  const [savedSets, setSavedSets] = useState<SavedSetItem[]>(() =>
    loadInitialSavedSets()
  );

  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editCandidateSet, setEditCandidateSet] = useState<number[] | null>(
    null
  );
  const [editTargetNumber, setEditTargetNumber] = useState<number | null>(null);

  const [message, setMessage] = useState("");
  const [copyDone, setCopyDone] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    fetch("/lotto_numbers.csv")
      .then((res) => res.text())
      .then((text) => {
        const parsed = text
          .split("\n")
          .slice(1)
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line) => {
            const cols = line.split(",");
            if (cols.length < 9) return null;

            return {
              round: Number(cols[0]),
              date: cols[1],
              numbers: [
                Number(cols[2]),
                Number(cols[3]),
                Number(cols[4]),
                Number(cols[5]),
                Number(cols[6]),
                Number(cols[7]),
              ],
              bonus: Number(cols[8]),
            } as LottoRow;
          })
          .filter(Boolean) as LottoRow[];

        setRows(parsed.sort((a, b) => b.round - a.round));
      })
      .catch(() => {
        setRows([]);
      });
  }, []);

  useEffect(() => {
    if (newSetKeys.length === 0) return;
    const timer = window.setTimeout(() => {
      setNewSetKeys([]);
    }, 1800);
    return () => window.clearTimeout(timer);
  }, [newSetKeys]);

  useEffect(() => {
    if (savedFlashKeys.length === 0) return;
    const timer = window.setTimeout(() => {
      setSavedFlashKeys([]);
    }, 1600);
    return () => window.clearTimeout(timer);
  }, [savedFlashKeys]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(savedSets));
      localStorage.removeItem(LEGACY_STORAGE_KEY);
      window.dispatchEvent(new Event("storage"));
    } catch {
      // ignore
    }
  }, [savedSets]);

  const savedSetKeySet = useMemo(() => {
    return new Set(savedSets.map((item) => getSetKey(item.numbers)));
  }, [savedSets]);

  const historyComboSet = useMemo(() => {
    return new Set(rows.map((row) => getSetKey(row.numbers)));
  }, [rows]);

  const recentExcludedNumbers = useMemo(() => {
    if (!useRecentExclude) return new Set<number>();

    const pickedRows = rows.slice(0, recentExcludeRound);
    const result = new Set<number>();

    pickedRows.forEach((row) => {
      row.numbers.forEach((num) => result.add(num));
      result.add(row.bonus);
    });

    includeNumbers.forEach((num) => result.delete(num));
    return result;
  }, [rows, useRecentExclude, recentExcludeRound, includeNumbers]);

  const loadedComboCount = rows.length;

  const statsProfile = useMemo(() => {
    const draws = rows.map((row) => [...row.numbers].sort((a, b) => a - b));
    const sums = draws.map((nums) => nums.reduce((a, b) => a + b, 0));
    const stds = draws.map((nums) => getStdDev(nums));
    const gaps = draws.map((nums) => getGapAverage(nums));

    const oddEvenPatternMap: Record<string, number> = {};
    const lowHighPatternMap: Record<string, number> = {};
    const allFrequencyMap: Record<number, number> = {};
    const recentFrequencyMap: Record<number, number> = {};

    draws.forEach((nums) => {
      const odd = getOddCount(nums);
      const even = 6 - odd;
      const low = getLowCount(nums);
      const high = 6 - low;

      oddEvenPatternMap[ratioKey(odd, even)] =
        (oddEvenPatternMap[ratioKey(odd, even)] || 0) + 1;

      lowHighPatternMap[ratioKey(low, high)] =
        (lowHighPatternMap[ratioKey(low, high)] || 0) + 1;

      nums.forEach((num) => {
        allFrequencyMap[num] = (allFrequencyMap[num] || 0) + 1;
      });
    });

    rows.slice(0, 20).forEach((row) => {
      row.numbers.forEach((num) => {
        recentFrequencyMap[num] = (recentFrequencyMap[num] || 0) + 1;
      });
    });

    return {
      avgSum: average(sums),
      avgStd: average(stds),
      avgGap: average(gaps),
      oddEvenPatternMap,
      lowHighPatternMap,
      allFrequencyMap,
      recentFrequencyMap,
      expectedFrequency: rows.length > 0 ? (rows.length * 6) / 45 : 0,
    };
  }, [rows]);

  function toggleIncludeNumber(num: number) {
    setMessage("");
    setIncludeNumbers((prev) => {
      if (prev.includes(num)) return prev.filter((n) => n !== num);
      if (prev.length >= 6) return prev;
      return [...prev, num].sort((a, b) => a - b);
    });
    setExcludeNumbers((prev) => prev.filter((n) => n !== num));
  }

  function toggleExcludeNumber(num: number) {
    setMessage("");
    setExcludeNumbers((prev) => {
      if (prev.includes(num)) return prev.filter((n) => n !== num);
      return [...prev, num].sort((a, b) => a - b);
    });
    setIncludeNumbers((prev) => prev.filter((n) => n !== num));
  }

  function resetAll() {
    setGameCount(5);
    setOddMin(2);
    setOddMax(4);
    setLowMin(2);
    setLowMax(4);
    setSumMin(115);
    setSumMax(165);
    setStdMin(10);
    setStdMax(16);
    setConsecutiveMode("allow2_block3");
    setExcludePastWinning(true);
    setUseRecentExclude(false);
    setRecentExcludeRound(10);
    setIncludeNumbers([]);
    setExcludeNumbers([]);
    setGeneratedSets([]);
    setNewSetKeys([]);
    setSavedFlashKeys([]);
    setEditingKey(null);
    setEditCandidateSet(null);
    setEditTargetNumber(null);
    setMessage("");
    setCopyDone(false);
    setIsGenerating(false);
  }

  function isValidSet(nums: number[]) {
    const sorted = [...nums].sort((a, b) => a - b);
    const oddCount = getOddCount(sorted);
    const lowCount = getLowCount(sorted);
    const sum = sorted.reduce((a, b) => a + b, 0);
    const std = getStdDev(sorted);
    const maxRun = getMaxConsecutiveRun(sorted);

    if (oddCount < oddMin || oddCount > oddMax) return false;
    if (lowCount < lowMin || lowCount > lowMax) return false;
    if (sum < sumMin || sum > sumMax) return false;
    if (std < stdMin || std > stdMax) return false;

    if (consecutiveMode === "allow2_block3" && maxRun >= 3) return false;
    if (consecutiveMode === "block2plus" && maxRun >= 2) return false;

    if (!includeNumbers.every((num) => sorted.includes(num))) return false;
    if (excludeNumbers.some((num) => sorted.includes(num))) return false;

    if (excludePastWinning && historyComboSet.has(getSetKey(sorted))) {
      return false;
    }

    return true;
  }

  function generateOneSet() {
    const fixed = [...includeNumbers].sort((a, b) => a - b);
    const blocked = new Set<number>(excludeNumbers);

    recentExcludedNumbers.forEach((num) => blocked.add(num));
    fixed.forEach((num) => blocked.delete(num));

    const available = Array.from({ length: 45 }, (_, i) => i + 1).filter(
      (num) => !blocked.has(num)
    );

    if (fixed.length > 6) return null;

    const remainNeed = 6 - fixed.length;
    const pool = available.filter((num) => !fixed.includes(num));

    if (pool.length < remainNeed) return null;

    for (let attempt = 0; attempt < 5000; attempt += 1) {
      const picked = shuffle(pool).slice(0, remainNeed);
      const set = [...fixed, ...picked].sort((a, b) => a - b);

      if (new Set(set).size !== 6) continue;
      if (isValidSet(set)) return set;
    }

    return null;
  }

  async function generateNumbers() {
    if (isGenerating) return;

    setCopyDone(false);
    setMessage("");

    if (oddMin > oddMax) {
      setMessage("홀수 최소값이 최대값보다 클 수 없습니다.");
      return;
    }

    if (lowMin > lowMax) {
      setMessage("저수 최소값이 최대값보다 클 수 없습니다.");
      return;
    }

    if (sumMin > sumMax) {
      setMessage("합계 시작값이 끝값보다 클 수 없습니다.");
      return;
    }

    if (stdMin > stdMax) {
      setMessage("표준편차 시작값이 끝값보다 클 수 없습니다.");
      return;
    }

    if (includeNumbers.length > 6) {
      setMessage("추가번호는 최대 6개까지 선택할 수 있습니다.");
      return;
    }

    const includeOdd = includeNumbers.filter((n) => n % 2 === 1).length;
    const includeLow = includeNumbers.filter((n) => n <= 22).length;
    const includeSum = includeNumbers.reduce((a, b) => a + b, 0);

    if (includeOdd > oddMax) {
      setMessage("추가번호에 포함된 홀수 개수가 현재 조건보다 많습니다.");
      return;
    }

    if (includeLow > lowMax) {
      setMessage("추가번호에 포함된 저수 개수가 현재 조건보다 많습니다.");
      return;
    }

    if (includeSum > sumMax) {
      setMessage("추가번호 합계가 현재 합계 조건을 초과합니다.");
      return;
    }

    setIsGenerating(true);

    await new Promise((resolve) => setTimeout(resolve, 350));

    const result: number[][] = [];
    const existingKeys = new Set(generatedSets.map((set) => getSetKey(set)));
    const newKeys = new Set<string>();

    for (let attempt = 0; attempt < gameCount * 5000; attempt += 1) {
      const one = generateOneSet();
      if (!one) continue;

      const key = getSetKey(one);

      if (existingKeys.has(key)) continue;
      if (newKeys.has(key)) continue;

      newKeys.add(key);
      result.push(one);

      if (result.length >= gameCount) break;
    }

    if (result.length === 0) {
      setIsGenerating(false);
      setMessage(
        "조건에 맞는 새 번호를 찾지 못했습니다. 조건을 조금 완화하거나 초기화 후 다시 시도해보세요."
      );
      return;
    }

    const addedKeys = result.map((set) => getSetKey(set));

    setGeneratedSets((prev) => [...result, ...prev]);
    setNewSetKeys(addedKeys);
    setIsGenerating(false);

    if (result.length < gameCount) {
      setMessage(
        `새로 ${result.length}게임이 추가되었습니다. 조건이 까다로워 요청한 수량보다 적게 생성되었습니다.`
      );
    } else {
      setMessage(`${result.length}게임이 추가되었습니다.`);
    }
  }

  async function copyNumbers() {
    if (generatedSets.length === 0) return;

    const text = generatedSets
      .map((set, idx) => `${idx + 1}게임 : ${formatSet(set)}`)
      .join("\n");

    try {
      await navigator.clipboard.writeText(text);
      setCopyDone(true);
      setTimeout(() => setCopyDone(false), 2000);
    } catch {
      setCopyDone(false);
      setMessage("복사에 실패했습니다.");
    }
  }

  function markSavedFlash(key: string) {
    setSavedFlashKeys((prev) => [key, ...prev.filter((item) => item !== key)]);
  }

  function saveSet(set: number[], overallScore?: number) {
    const normalized = [...set].sort((a, b) => a - b);
    const key = getSetKey(normalized);

    const exists = savedSets.some((item) => getSetKey(item.numbers) === key);

    if (exists) {
      markSavedFlash(key);
      setMessage("이미 저장된 번호입니다.");
      return;
    }

    const createdAt = Date.now();
    const score =
      typeof overallScore === "number" ? Math.round(overallScore) : null;

    const newItem: SavedSetItem = {
      id: `${createdAt}_${key}`,
      numbers: normalized,
      score,
      scoreLabel: getScoreLabel(score),
      createdAt,
      applyDate: getNextSaturdayString(createdAt),
      source: "generator",
    };

    const updated = [newItem, ...savedSets];
    setSavedSets(updated);
    markSavedFlash(key);
    setMessage("구매메뉴에 저장되었습니다.");
  }

  function startEdit(setNumbers: number[]) {
    const normalized = [...setNumbers].sort((a, b) => a - b);
    setEditingKey(getSetKey(normalized));
    setEditCandidateSet(normalized);
    setEditTargetNumber(normalized[0] ?? null);
    setMessage("");
  }

  function cancelEdit() {
    setEditingKey(null);
    setEditCandidateSet(null);
    setEditTargetNumber(null);
  }

  function changeEditTarget(num: number) {
    setEditTargetNumber(num);
  }

  function replaceEditNumber(newNum: number) {
    if (!editCandidateSet || editTargetNumber === null) return;
    if (newNum === editTargetNumber) return;

    if (editCandidateSet.includes(newNum)) {
      setMessage("같은 조합 안에서는 같은 번호를 중복 선택할 수 없습니다.");
      return;
    }

    const replaced = editCandidateSet
      .map((num) => (num === editTargetNumber ? newNum : num))
      .sort((a, b) => a - b);

    setEditCandidateSet(replaced);
    setEditTargetNumber(newNum);
    setMessage("");
  }

  function saveEditedSet() {
    if (!editingKey || !editCandidateSet) return;

    const normalized = [...editCandidateSet].sort((a, b) => a - b);

    if (new Set(normalized).size !== 6) {
      setMessage("수정된 번호에 중복이 있습니다.");
      return;
    }

    const newKey = getSetKey(normalized);

    const existsElsewhere = generatedSets.some(
      (set) => getSetKey(set) === newKey && getSetKey(set) !== editingKey
    );

    if (existsElsewhere) {
      setMessage("이미 생성 결과에 같은 번호 조합이 있습니다.");
      return;
    }

    setGeneratedSets((prev) =>
      prev.map((set) => (getSetKey(set) === editingKey ? normalized : set))
    );

    setNewSetKeys((prev) =>
      prev.map((key) => (key === editingKey ? newKey : key))
    );

    setEditingKey(null);
    setEditCandidateSet(null);
    setEditTargetNumber(null);
    setMessage("번호가 수정되었습니다.");
  }

  const evaluatedSets = useMemo<EvaluatedSet[]>(() => {
    return generatedSets.map((set) => {
      const sorted = [...set].sort((a, b) => a - b);
      const setKey = getSetKey(sorted);
      const oddCount = getOddCount(sorted);
      const lowCount = getLowCount(sorted);
      const sum = sorted.reduce((a, b) => a + b, 0);
      const std = getStdDev(sorted);
      const maxRun = getMaxConsecutiveRun(sorted);
      const gapAverage = getGapAverage(sorted);
      const oddEvenKey = ratioKey(oddCount, 6 - oddCount);
      const lowHighKey = ratioKey(lowCount, 6 - lowCount);

      const includeHit = includeNumbers.filter((n) => sorted.includes(n)).length;
      const excludeHit = excludeNumbers.filter((n) => sorted.includes(n)).length;
      const recentHit = Array.from(recentExcludedNumbers).filter((n) =>
        sorted.includes(n)
      ).length;

      const oddScore = getPatternFrequencyScore(
        oddEvenKey,
        statsProfile.oddEvenPatternMap,
        rows.length
      );

      const lowScore = getPatternFrequencyScore(
        lowHighKey,
        statsProfile.lowHighPatternMap,
        rows.length
      );

      const sumScore = getCenterClosenessScore(
        sum,
        statsProfile.avgSum,
        26,
        28
      );

      const stdScore = getCenterClosenessScore(
        std,
        statsProfile.avgStd,
        3.8,
        28
      );

      const gapScore = getCenterClosenessScore(
        gapAverage,
        statsProfile.avgGap,
        1.9,
        32
      );

      const decadeScore = getDecadeSpreadScore(sorted);

      const consecutiveScore = getConsecutiveStructureScore(
        maxRun,
        consecutiveMode
      );

      const freqBalanceScore = getFrequencyBalanceScore(
        sorted,
        statsProfile.allFrequencyMap,
        statsProfile.expectedFrequency
      );

      const recentHeatScore = getRecentHeatPenaltyScore(
        sorted,
        statsProfile.recentFrequencyMap
      );

      const includeScore =
        includeNumbers.length === 0
          ? 100
          : clamp((includeHit / includeNumbers.length) * 100);

      const excludeScore = excludeHit === 0 ? 100 : 0;
      const historyScore =
        !excludePastWinning || !historyComboSet.has(getSetKey(sorted)) ? 100 : 0;
      const recentExcludeScore = !useRecentExclude || recentHit === 0 ? 100 : 0;

      const weighted =
        oddScore * 0.12 +
        lowScore * 0.12 +
        sumScore * 0.15 +
        stdScore * 0.14 +
        gapScore * 0.1 +
        decadeScore * 0.08 +
        consecutiveScore * 0.08 +
        freqBalanceScore * 0.09 +
        recentHeatScore * 0.08 +
        includeScore * 0.02 +
        excludeScore * 0.01 +
        historyScore * 0.005 +
        recentExcludeScore * 0.005;

      const overallScore = Math.round(clamp(weighted));

      const scoreItems: ScoreItem[] = [
        { label: "홀짝패턴", score: Math.round(oddScore) },
        { label: "저수패턴", score: Math.round(lowScore) },
        { label: "합계", score: Math.round(sumScore) },
        { label: "표준편차", score: Math.round(stdScore) },
        { label: "간격분포", score: Math.round(gapScore) },
        { label: "구간분산", score: Math.round(decadeScore) },
        { label: "연속구조", score: Math.round(consecutiveScore) },
        { label: "빈도균형", score: Math.round(freqBalanceScore) },
        { label: "최근과열", score: Math.round(recentHeatScore) },
      ];

      if (includeNumbers.length > 0) {
        scoreItems.push({ label: "추가번호", score: Math.round(includeScore) });
      }

      scoreItems.push({ label: "제외번호", score: Math.round(excludeScore) });
      scoreItems.push({ label: "과거당첨", score: Math.round(historyScore) });

      if (useRecentExclude) {
        scoreItems.push({
          label: "최근제외",
          score: Math.round(recentExcludeScore),
        });
      }

      return {
        numbers: sorted,
        displayText: formatSet(sorted),
        overallScore,
        scoreItems,
        isNew: newSetKeys.includes(setKey),
        isSaved: savedSetKeySet.has(setKey),
        isJustSaved: savedFlashKeys.includes(setKey),
      };
    });
  }, [
    generatedSets,
    consecutiveMode,
    includeNumbers,
    excludeNumbers,
    historyComboSet,
    excludePastWinning,
    useRecentExclude,
    recentExcludedNumbers,
    newSetKeys,
    savedFlashKeys,
    savedSetKeySet,
    statsProfile,
    rows.length,
  ]);

  const summaryRecentText = useRecentExclude
    ? `ON (${recentExcludeRound}회)`
    : "OFF";

  const consecutiveLabel =
    consecutiveMode === "allow2_block3"
      ? "2연속 허용 / 3연속 이상 제거"
      : consecutiveMode === "block2plus"
      ? "2연속 이상 제거"
      : "제한 없음";

  return (
    <div className="analysis-page">
      <div className="generator-page-stack">
        <section className="analysis-dashboard-card generator-hero-card">
          <h2 className="analysis-card-title">번호 생성기</h2>
          <p className="analysis-card-subtext">
            조건을 설정하고 제외번호·추가번호를 직접 클릭해 번호를 생성합니다.
          </p>
        </section>

        <div className="generator-main-grid">
          <section className="analysis-dashboard-card generator-option-card">
            <h3 className="analysis-card-title">생성 옵션</h3>

            <div className="generator-form-grid">
              <label className="generator-field">
                <span className="generator-field-label">게임 수</span>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={gameCount}
                  onChange={(e) =>
                    setGameCount(
                      Math.min(20, Math.max(1, Number(e.target.value) || 1))
                    )
                  }
                />
              </label>

              <label className="generator-field">
                <span className="generator-field-label">홀수 최소</span>
                <input
                  type="number"
                  min={0}
                  max={6}
                  value={oddMin}
                  onChange={(e) =>
                    setOddMin(
                      Math.min(6, Math.max(0, Number(e.target.value) || 0))
                    )
                  }
                />
              </label>

              <label className="generator-field">
                <span className="generator-field-label">홀수 최대</span>
                <input
                  type="number"
                  min={0}
                  max={6}
                  value={oddMax}
                  onChange={(e) =>
                    setOddMax(
                      Math.min(6, Math.max(0, Number(e.target.value) || 0))
                    )
                  }
                />
              </label>

              <label className="generator-field">
                <span className="generator-field-label">저수(1~22) 최소</span>
                <input
                  type="number"
                  min={0}
                  max={6}
                  value={lowMin}
                  onChange={(e) =>
                    setLowMin(
                      Math.min(6, Math.max(0, Number(e.target.value) || 0))
                    )
                  }
                />
              </label>

              <label className="generator-field">
                <span className="generator-field-label">저수(1~22) 최대</span>
                <input
                  type="number"
                  min={0}
                  max={6}
                  value={lowMax}
                  onChange={(e) =>
                    setLowMax(
                      Math.min(6, Math.max(0, Number(e.target.value) || 0))
                    )
                  }
                />
              </label>

              <div className="generator-field generator-range-field">
                <span className="generator-field-label">합계 범위</span>
                <div className="generator-range-inputs">
                  <input
                    type="number"
                    min={21}
                    max={279}
                    value={sumMin}
                    onChange={(e) => setSumMin(Number(e.target.value) || 0)}
                    placeholder="115"
                  />
                  <span className="generator-range-separator">~</span>
                  <input
                    type="number"
                    min={21}
                    max={279}
                    value={sumMax}
                    onChange={(e) => setSumMax(Number(e.target.value) || 0)}
                    placeholder="165"
                  />
                </div>
                <span className="generator-field-hint">예: 115 ~ 165</span>
              </div>

              <div className="generator-field generator-range-field">
                <span className="generator-field-label">표준편차 범위</span>
                <div className="generator-range-inputs">
                  <input
                    type="number"
                    step="0.1"
                    min={0}
                    max={30}
                    value={stdMin}
                    onChange={(e) => setStdMin(Number(e.target.value) || 0)}
                    placeholder="10.0"
                  />
                  <span className="generator-range-separator">~</span>
                  <input
                    type="number"
                    step="0.1"
                    min={0}
                    max={30}
                    value={stdMax}
                    onChange={(e) => setStdMax(Number(e.target.value) || 0)}
                    placeholder="16.0"
                  />
                </div>
                <span className="generator-field-hint">예: 10.0 ~ 16.0</span>
              </div>

              <label className="generator-field generator-field-full">
                <span className="generator-field-label">연속번호 제한</span>
                <select
                  value={consecutiveMode}
                  onChange={(e) =>
                    setConsecutiveMode(e.target.value as ConsecutiveMode)
                  }
                >
                  <option value="allow2_block3">
                    2연속 허용 / 3연속 이상 제거
                  </option>
                  <option value="block2plus">2연속 이상 제거</option>
                  <option value="free">제한 없음</option>
                </select>
              </label>

              <label className="generator-field">
                <span className="generator-field-label">과거 당첨번호 제외</span>
                <select
                  value={excludePastWinning ? "yes" : "no"}
                  onChange={(e) =>
                    setExcludePastWinning(e.target.value === "yes")
                  }
                >
                  <option value="yes">제외함</option>
                  <option value="no">제외 안함</option>
                </select>
              </label>

              <label className="generator-field">
                <span className="generator-field-label">
                  최근 N회 번호 제외 사용
                </span>
                <select
                  value={useRecentExclude ? "yes" : "no"}
                  onChange={(e) => setUseRecentExclude(e.target.value === "yes")}
                >
                  <option value="no">사용 안함</option>
                  <option value="yes">사용함</option>
                </select>
              </label>

              {useRecentExclude && (
                <label className="generator-field">
                  <span className="generator-field-label">최근 제외 회차 수</span>
                  <select
                    value={recentExcludeRound}
                    onChange={(e) =>
                      setRecentExcludeRound(
                        Number(e.target.value) as RecentExcludeRound
                      )
                    }
                  >
                    <option value={1}>최근 1회</option>
                    <option value={2}>최근 2회</option>
                    <option value={3}>최근 3회</option>
                    <option value={4}>최근 4회</option>
                    <option value={5}>최근 5회</option>
                    <option value={6}>최근 6회</option>
                    <option value={7}>최근 7회</option>
                    <option value={8}>최근 8회</option>
                    <option value={9}>최근 9회</option>
                    <option value={10}>최근 10회</option>
                    <option value={20}>최근 20회</option>
                    <option value={30}>최근 30회</option>
                    <option value={40}>최근 40회</option>
                  </select>
                </label>
              )}
            </div>

            <div className="generator-desc-box">
              <div className="generator-desc-item">
                <span className="generator-desc-badge">합계</span>
                <p className="generator-help-text">
                  6개 번호의 총합입니다. 너무 낮거나 높은 극단값보다 중간 구간을
                  권장합니다.
                </p>
              </div>

              <div className="generator-desc-item">
                <span className="generator-desc-badge">표준편차</span>
                <p className="generator-help-text">
                  번호 간 퍼짐 정도입니다. 낮으면 몰리고, 높으면 넓게 분산됩니다.
                </p>
              </div>

              <div className="generator-desc-item">
                <span className="generator-desc-badge">저수</span>
                <p className="generator-help-text">
                  저수는 1~22번 구간 번호를 뜻합니다. 예를 들어 저수 최소 2,
                  최대 4라면 6개 번호 중 1~22번이 2개에서 4개 사이로 포함된
                  조합만 생성됩니다.
                </p>
              </div>
            </div>
          </section>

          <section className="analysis-dashboard-card generator-summary-card compact">
            <h3 className="analysis-card-title">현재 필터</h3>

            <div className="generator-summary-badges">
              <div className="summary-badge">
                <span>게임</span>
                <strong>{gameCount}</strong>
              </div>

              <div className="summary-badge">
                <span>홀수</span>
                <strong>
                  {oddMin}~{oddMax}
                </strong>
              </div>

              <div className="summary-badge">
                <span>저수</span>
                <strong>
                  {lowMin}~{lowMax}
                </strong>
              </div>

              <div className="summary-badge highlight">
                <span>합계</span>
                <strong>
                  {sumMin}~{sumMax}
                </strong>
              </div>

              <div className="summary-badge">
                <span>표준편차</span>
                <strong>
                  {stdMin}~{stdMax}
                </strong>
              </div>

              <div className="summary-badge">
                <span>연속</span>
                <strong>{consecutiveLabel}</strong>
              </div>

              <div className="summary-badge">
                <span>과거제외</span>
                <strong>{excludePastWinning ? "ON" : "OFF"}</strong>
              </div>

              <div className="summary-badge">
                <span>최근제외</span>
                <strong>{summaryRecentText}</strong>
              </div>

              <div className="summary-badge subtle">
                <span>데이터</span>
                <strong>{loadedComboCount}</strong>
              </div>
            </div>
          </section>
        </div>

        <section className="analysis-dashboard-card generator-pick-card">
          <div className="generator-pick-header">
            <h3 className="analysis-card-title">번호 직접 선택</h3>
            <p className="analysis-card-subtext">
              추가번호와 제외번호는 공을 클릭해서 선택합니다. 같은 번호는 두 곳에
              동시에 들어갈 수 없습니다.
            </p>
          </div>

          <div className="generator-pick-panels">
            <div className="generator-pick-panel">
              <div className="generator-pick-title-row">
                <strong>추가번호</strong>
                <span>{includeNumbers.length}개 선택</span>
              </div>
              <div className="generator-ball-grid">
                {Array.from({ length: 45 }, (_, i) => i + 1).map((num) => {
                  const active = includeNumbers.includes(num);
                  return (
                    <button
                      key={`include-${num}`}
                      type="button"
                      className={`generator-ball-select ${
                        active ? "active include" : ""
                      }`}
                      onClick={() => toggleIncludeNumber(num)}
                    >
                      <span className={getBallClass(num)}>{num}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="generator-pick-panel">
              <div className="generator-pick-title-row">
                <strong>제외번호</strong>
                <span>{excludeNumbers.length}개 선택</span>
              </div>
              <div className="generator-ball-grid">
                {Array.from({ length: 45 }, (_, i) => i + 1).map((num) => {
                  const active = excludeNumbers.includes(num);
                  return (
                    <button
                      key={`exclude-${num}`}
                      type="button"
                      className={`generator-ball-select ${
                        active ? "active exclude" : ""
                      }`}
                      onClick={() => toggleExcludeNumber(num)}
                    >
                      <span className={getBallClass(num)}>{num}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="generator-selected-strip-wrap">
            <div className="generator-selected-strip">
              <span className="generator-selected-label">추가번호</span>
              <div className="generator-selected-balls">
                {includeNumbers.length === 0 ? (
                  <em>선택 없음</em>
                ) : (
                  includeNumbers.map((num) => (
                    <span key={`inc-chip-${num}`} className={getBallClass(num)}>
                      {num}
                    </span>
                  ))
                )}
              </div>
            </div>

            <div className="generator-selected-strip">
              <span className="generator-selected-label">제외번호</span>
              <div className="generator-selected-balls">
                {excludeNumbers.length === 0 ? (
                  <em>선택 없음</em>
                ) : (
                  excludeNumbers.map((num) => (
                    <span key={`exc-chip-${num}`} className={getBallClass(num)}>
                      {num}
                    </span>
                  ))
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="analysis-dashboard-card generator-result-card">
          <div className="generator-result-header">
            <div>
              <h3 className="analysis-card-title">생성 결과</h3>
              <p className="analysis-card-subtext generator-result-subtext">
                새로 생성된 번호는 항상 위쪽에 추가됩니다.
              </p>
            </div>

            <div className="generator-action-row generator-action-row-top">
              <button
                type="button"
                className={`generator-primary-btn ${
                  isGenerating ? "loading" : ""
                }`}
                onClick={generateNumbers}
                disabled={isGenerating}
              >
                {isGenerating ? (
                  <>
                    <span className="generator-btn-spinner" />
                    생성 중...
                  </>
                ) : (
                  "번호 생성"
                )}
              </button>

              <button
                type="button"
                className="generator-secondary-btn"
                onClick={copyNumbers}
              >
                {copyDone ? "복사 완료" : "번호 복사"}
              </button>

              <button
                type="button"
                className="generator-secondary-btn"
                onClick={resetAll}
              >
                초기화
              </button>
            </div>
          </div>

          {message && <div className="generator-message-box">{message}</div>}

          {evaluatedSets.length === 0 ? (
            <div className="generator-empty-text">생성된 번호가 없습니다.</div>
          ) : (
            <div className="generator-result-scroll">
              <div className="generator-result-list">
                {evaluatedSets.map((item, idx) => {
                  const itemKey = getSetKey(item.numbers);
                  const isEditing = editingKey === itemKey;

                  return (
                    <div
                      key={`set-${item.displayText}-${idx}`}
                      className={`generator-result-row compact ${
                        item.isNew ? "newly-added" : ""
                      } ${item.isSaved ? "saved-row" : ""} ${
                        item.isJustSaved ? "just-saved" : ""
                      }`}
                    >
                      <div className="generator-result-topline compact">
                        <div className="generator-result-meta compact">
                          <div className="generator-result-title-row">
                            <strong>{idx + 1}게임</strong>
                            {item.isNew && (
                              <span className="generator-new-badge">NEW</span>
                            )}
                            {item.isSaved && (
                              <span className="generator-saved-badge">
                                저장됨
                              </span>
                            )}
                          </div>
                          <span>{item.displayText}</span>
                        </div>

                        <div className="generator-fit-badge compact">
                          종합 적합도 <strong>{item.overallScore}%</strong>
                        </div>
                      </div>

                      <div className="generator-result-balls prominent">
                        {item.numbers.map((num) => (
                          <span
                            key={`set-${idx}-${num}`}
                            className={getBallClass(num)}
                          >
                            {num}
                          </span>
                        ))}
                      </div>

                      <div className="generator-score-text-grid">
                        {item.scoreItems.map((score) => (
                          <div
                            key={`${idx}-${score.label}`}
                            className="generator-score-text-item"
                          >
                            <span>{score.label}</span>
                            <strong>{score.score}%</strong>
                          </div>
                        ))}
                      </div>

                      <div className="generator-result-actions">
                        <button
                          type="button"
                          className={`generator-action-mini-btn ${
                            isEditing ? "active" : ""
                          }`}
                          onClick={() => startEdit(item.numbers)}
                        >
                          수정
                        </button>

                        <button
                          type="button"
                          className={`generator-secondary-btn ${
                            item.isSaved ? "saved-btn" : ""
                          }`}
                          onClick={() =>
                            saveSet(
                              isEditing && editCandidateSet
                                ? editCandidateSet
                                : item.numbers,
                              item.overallScore
                            )
                          }
                          disabled={item.isSaved}
                        >
                          {item.isSaved ? "저장완료" : "저장"}
                        </button>
                      </div>

                      {isEditing && editCandidateSet && (
                        <div className="generator-edit-panel">
                          <div className="generator-edit-header">
                            <strong>번호 수정</strong>
                            <span>
                              위 6개 번호 중 하나를 선택한 뒤 아래 번호판에서
                              교체하세요.
                            </span>
                          </div>

                          <div className="generator-edit-current">
                            {editCandidateSet.map((num) => (
                              <button
                                key={`edit-current-${num}`}
                                type="button"
                                className={`generator-edit-current-ball ${
                                  editTargetNumber === num ? "selected" : ""
                                }`}
                                onClick={() => changeEditTarget(num)}
                              >
                                <span className={getBallClass(num)}>{num}</span>
                              </button>
                            ))}
                          </div>

                          <div className="generator-edit-help">
                            현재 선택 번호:{" "}
                            <strong>
                              {editTargetNumber === null
                                ? "-"
                                : editTargetNumber}
                            </strong>
                          </div>

                          <div className="generator-edit-ball-grid">
                            {Array.from({ length: 45 }, (_, i) => i + 1).map(
                              (num) => {
                                const duplicated =
                                  editCandidateSet.includes(num) &&
                                  num !== editTargetNumber;

                                return (
                                  <button
                                    key={`edit-pick-${num}`}
                                    type="button"
                                    className={`generator-edit-ball-btn ${
                                      num === editTargetNumber ? "selected" : ""
                                    } ${duplicated ? "disabled" : ""}`}
                                    onClick={() => replaceEditNumber(num)}
                                    disabled={duplicated}
                                  >
                                    <span className={getBallClass(num)}>
                                      {num}
                                    </span>
                                  </button>
                                );
                              }
                            )}
                          </div>

                          <div className="generator-edit-actions">
                            <button
                              type="button"
                              className="generator-primary-btn small"
                              onClick={saveEditedSet}
                            >
                              수정 완료
                            </button>

                            <button
                              type="button"
                              className="generator-secondary-btn small"
                              onClick={cancelEdit}
                            >
                              취소
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}