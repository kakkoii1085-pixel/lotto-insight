import { useEffect, useMemo, useState } from "react";
import { loadHistory } from "../data/history";

type LottoDraw = {
  round: number;
  date: string;
  numbers: number[];
  bonus: number;
};

type GeneratedNumbers = number[];

const LOTTO_MIN = 1;
const LOTTO_MAX = 45;
const PICK_COUNT = 6;
const LOW_MAX = 22;

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getRandomCombination(availablePool?: number[]): number[] {
  const picked = new Set<number>();
  const pool = availablePool && availablePool.length > 0
    ? [...availablePool]
    : Array.from({ length: 45 }, (_, i) => i + 1);

  if (pool.length < PICK_COUNT) return [];

  while (picked.size < PICK_COUNT) {
    const num = pool[randomInt(0, pool.length - 1)];
    picked.add(num);

    if (picked.size === pool.length && picked.size < PICK_COUNT) {
      return [];
    }
  }

  return Array.from(picked).sort((a, b) => a - b);
}

function countOdd(numbers: number[]): number {
  return numbers.filter((n) => n % 2 !== 0).length;
}

function countLow(numbers: number[]): number {
  return numbers.filter((n) => n <= LOW_MAX).length;
}

function getMaxConsecutiveRun(numbers: number[]): number {
  if (numbers.length === 0) return 0;

  let maxRun = 1;
  let currentRun = 1;

  for (let i = 1; i < numbers.length; i++) {
    if (numbers[i] === numbers[i - 1] + 1) {
      currentRun += 1;
      maxRun = Math.max(maxRun, currentRun);
    } else {
      currentRun = 1;
    }
  }

  return maxRun;
}

function getBallClassName(num: number): string {
  if (num <= 10) return "yellow";
  if (num <= 20) return "navy";
  if (num <= 30) return "red";
  if (num <= 40) return "gray";
  return "green";
}

function getCopyText(results: GeneratedNumbers[]): string {
  return results.map((row, index) => `${index + 1}게임: ${row.join(", ")}`).join("\n");
}

function toKey(numbers: number[]): string {
  return [...numbers].sort((a, b) => a - b).join(",");
}

export default function Generator() {
  const [history, setHistory] = useState<LottoDraw[]>([]);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(true);
  const [historyError, setHistoryError] = useState<string>("");

  const [gameCount, setGameCount] = useState<number>(5);

  const [oddMin, setOddMin] = useState<number>(2);
  const [oddMax, setOddMax] = useState<number>(4);

  const [lowMin, setLowMin] = useState<number>(2);
  const [lowMax, setLowMax] = useState<number>(4);

  const [allowTwoConsecutive, setAllowTwoConsecutive] = useState<boolean>(true);

  const [excludePastWinning, setExcludePastWinning] = useState<boolean>(true);
  const [excludeRecentUsedNumbers, setExcludeRecentUsedNumbers] = useState<boolean>(false);
  const [recentExcludeCount, setRecentExcludeCount] = useState<number>(10);

  const [results, setResults] = useState<GeneratedNumbers[]>([]);
  const [message, setMessage] = useState<string>("");

  useEffect(() => {
    let mounted = true;

    async function fetchHistory() {
      try {
        setLoadingHistory(true);
        setHistoryError("");

        const data = await loadHistory();

        if (!mounted) return;

        const normalized = (data as LottoDraw[])
          .filter(
            (item) =>
              item &&
              typeof item.round === "number" &&
              Array.isArray(item.numbers) &&
              item.numbers.length === 6
          )
          .sort((a, b) => b.round - a.round);

        setHistory(normalized);
      } catch {
        if (!mounted) return;
        setHistoryError("역대 데이터를 불러오지 못했습니다.");
      } finally {
        if (mounted) {
          setLoadingHistory(false);
        }
      }
    }

    fetchHistory();

    return () => {
      mounted = false;
    };
  }, []);

  const maxConsecutiveAllowed = useMemo(() => {
    return allowTwoConsecutive ? 2 : 1;
  }, [allowTwoConsecutive]);

  const pastWinningSet = useMemo(() => {
    const set = new Set<string>();
    for (const draw of history) {
      set.add(toKey(draw.numbers));
    }
    return set;
  }, [history]);

  const recentExcludedNumberSet = useMemo(() => {
    const set = new Set<number>();

    if (!excludeRecentUsedNumbers) return set;
    if (recentExcludeCount <= 0) return set;

    const recentDraws = history.slice(0, recentExcludeCount);
    for (const draw of recentDraws) {
      for (const num of draw.numbers) {
        set.add(num);
      }
    }

    return set;
  }, [history, excludeRecentUsedNumbers, recentExcludeCount]);

  const availablePool = useMemo(() => {
    const base = Array.from({ length: 45 }, (_, i) => i + 1);

    if (!excludeRecentUsedNumbers) return base;

    return base.filter((num) => !recentExcludedNumberSet.has(num));
  }, [excludeRecentUsedNumbers, recentExcludedNumberSet]);

  const validationMessage = useMemo(() => {
    if (loadingHistory) {
      return "역대 데이터를 불러오는 중입니다.";
    }

    if (historyError) {
      return historyError;
    }

    if (!Number.isFinite(gameCount) || gameCount < 1 || gameCount > 20) {
      return "게임 수는 1~20 사이로 입력해 주세요.";
    }

    if (
      !Number.isFinite(oddMin) ||
      !Number.isFinite(oddMax) ||
      !Number.isFinite(lowMin) ||
      !Number.isFinite(lowMax)
    ) {
      return "필터 값은 숫자로 입력해 주세요.";
    }

    if (oddMin < 0 || oddMax > 6 || lowMin < 0 || lowMax > 6) {
      return "홀수/저수 개수 범위는 0~6 사이여야 합니다.";
    }

    if (oddMin > oddMax) {
      return "홀수 최소값은 최대값보다 클 수 없습니다.";
    }

    if (lowMin > lowMax) {
      return "저수 최소값은 최대값보다 클 수 없습니다.";
    }

    if (
      excludeRecentUsedNumbers &&
      (!Number.isFinite(recentExcludeCount) || recentExcludeCount < 0)
    ) {
      return "최근 제외 회차 수는 0 이상이어야 합니다.";
    }

    if (excludeRecentUsedNumbers && availablePool.length < PICK_COUNT) {
      return `최근 ${recentExcludeCount}회 번호 제외 조건이 너무 강해서 사용 가능한 번호가 ${availablePool.length}개뿐입니다.`;
    }

    return "";
  }, [
    loadingHistory,
    historyError,
    gameCount,
    oddMin,
    oddMax,
    lowMin,
    lowMax,
    excludeRecentUsedNumbers,
    recentExcludeCount,
    availablePool.length,
  ]);

  function isValidCombination(numbers: number[]): boolean {
    if (numbers.length !== PICK_COUNT) return false;
    if (new Set(numbers).size !== PICK_COUNT) return false;

    for (let i = 1; i < numbers.length; i++) {
      if (numbers[i] <= numbers[i - 1]) return false;
    }

    const oddCount = countOdd(numbers);
    if (oddCount < oddMin || oddCount > oddMax) return false;

    const lowCount = countLow(numbers);
    if (lowCount < lowMin || lowCount > lowMax) return false;

    const maxRun = getMaxConsecutiveRun(numbers);
    if (maxRun > maxConsecutiveAllowed) return false;

    if (excludePastWinning && pastWinningSet.has(toKey(numbers))) return false;

    if (excludeRecentUsedNumbers) {
      for (const num of numbers) {
        if (recentExcludedNumberSet.has(num)) return false;
      }
    }

    return true;
  }

  function handleGenerate() {
    if (validationMessage) {
      setMessage(validationMessage);
      setResults([]);
      return;
    }

    const generated: GeneratedNumbers[] = [];
    const uniqueSet = new Set<string>();

    const MAX_ATTEMPTS = 100000;
    let attempts = 0;

    while (generated.length < gameCount && attempts < MAX_ATTEMPTS) {
      attempts += 1;

      const combination = getRandomCombination(availablePool);
      if (combination.length !== PICK_COUNT) continue;
      if (!isValidCombination(combination)) continue;

      const key = toKey(combination);
      if (uniqueSet.has(key)) continue;

      uniqueSet.add(key);
      generated.push(combination);
    }

    setResults(generated);

    if (generated.length === gameCount) {
      setMessage(`총 ${generated.length}게임 생성 완료`);
    } else if (generated.length > 0) {
      setMessage(
        `조건이 다소 까다로워 ${generated.length}게임만 생성되었습니다. 조건을 조금 완화해 보세요.`
      );
    } else {
      setMessage(
        "조건이 너무 까다로워 번호를 생성하지 못했습니다. 최근 제외 회차 수 또는 필터 범위를 완화해 주세요."
      );
    }
  }

  async function handleCopy() {
    if (results.length === 0) {
      setMessage("먼저 번호를 생성해 주세요.");
      return;
    }

    try {
      await navigator.clipboard.writeText(getCopyText(results));
      setMessage("생성 결과를 복사했습니다.");
    } catch {
      setMessage("복사에 실패했습니다. 브라우저 권한을 확인해 주세요.");
    }
  }

  function handleReset() {
    setGameCount(5);
    setOddMin(2);
    setOddMax(4);
    setLowMin(2);
    setLowMax(4);
    setAllowTwoConsecutive(true);
    setExcludePastWinning(true);
    setExcludeRecentUsedNumbers(false);
    setRecentExcludeCount(10);
    setResults([]);
    setMessage("");
  }

  return (
    <div className="pageWrap">
      <div className="pageInner">
        <h2 className="pageTitle">번호 생성기</h2>
        <p className="helperText" style={{ marginBottom: "18px" }}>
          조건 기반 전략형 로또 번호 생성
        </p>

        <div className="generatorGrid">
          <div className="panel">
            <div className="panelHeader">
              <h3 className="panelTitle">생성 옵션</h3>
            </div>

            <div className="fieldBlock">
              <label className="fieldLabel">게임 수</label>
              <input
                className="input"
                type="number"
                min={1}
                max={20}
                value={gameCount}
                onChange={(e) => setGameCount(Number(e.target.value))}
              />
            </div>

            <div className="filterGrid">
              <div className="fieldBlock">
                <label className="fieldLabel">홀수 최소</label>
                <input
                  className="input"
                  type="number"
                  min={0}
                  max={6}
                  value={oddMin}
                  onChange={(e) => setOddMin(Number(e.target.value))}
                />
              </div>

              <div className="fieldBlock">
                <label className="fieldLabel">홀수 최대</label>
                <input
                  className="input"
                  type="number"
                  min={0}
                  max={6}
                  value={oddMax}
                  onChange={(e) => setOddMax(Number(e.target.value))}
                />
              </div>

              <div className="fieldBlock">
                <label className="fieldLabel">저수(1~22) 최소</label>
                <input
                  className="input"
                  type="number"
                  min={0}
                  max={6}
                  value={lowMin}
                  onChange={(e) => setLowMin(Number(e.target.value))}
                />
              </div>

              <div className="fieldBlock">
                <label className="fieldLabel">저수(1~22) 최대</label>
                <input
                  className="input"
                  type="number"
                  min={0}
                  max={6}
                  value={lowMax}
                  onChange={(e) => setLowMax(Number(e.target.value))}
                />
              </div>
            </div>

            <div className="fieldBlock">
              <label className="fieldLabel">연속번호 제한</label>
              <select
                className="input"
                value={allowTwoConsecutive ? "allow2" : "deny2"}
                onChange={(e) => setAllowTwoConsecutive(e.target.value === "allow2")}
              >
                <option value="allow2">2연속 허용 / 3연속 이상 제거</option>
                <option value="deny2">2연속도 제거</option>
              </select>
            </div>

            <div className="fieldBlock">
              <label className="fieldLabel">과거 당첨번호 제외</label>
              <select
                className="input"
                value={excludePastWinning ? "yes" : "no"}
                onChange={(e) => setExcludePastWinning(e.target.value === "yes")}
              >
                <option value="yes">제외함</option>
                <option value="no">제외 안함</option>
              </select>
            </div>

            <div className="fieldBlock">
              <label className="fieldLabel">최근 N회 번호 제외 사용</label>
              <select
                className="input"
                value={excludeRecentUsedNumbers ? "yes" : "no"}
                onChange={(e) => setExcludeRecentUsedNumbers(e.target.value === "yes")}
              >
                <option value="no">사용 안함</option>
                <option value="yes">사용함</option>
              </select>
            </div>

            {excludeRecentUsedNumbers && (
              <div className="fieldBlock">
                <label className="fieldLabel">최근 제외 회차 수</label>
                <input
                  className="input"
                  type="number"
                  min={1}
                  max={50}
                  value={recentExcludeCount}
                  onChange={(e) => setRecentExcludeCount(Number(e.target.value))}
                />
              </div>
            )}

            <p className="helperText" style={{ marginTop: "4px" }}>
              홀짝, 저고, 연속번호, 과거 조합, 최근 출현번호 조건을 동시에 적용합니다.
            </p>

            <div className="buttonRow">
              <button className="primaryBtn" type="button" onClick={handleGenerate}>
                번호 생성
              </button>
              <button className="subBtn" type="button" onClick={handleCopy}>
                번호 복사
              </button>
              <button className="iconBtn" type="button" onClick={handleReset}>
                초기화
              </button>
            </div>
          </div>

          <div className="panel">
            <div className="panelHeader">
              <h3 className="panelTitle">현재 필터 요약</h3>
            </div>

            <div className="chipWrap">
              <div className="countChip">
                <span className="countText">게임 수: {gameCount}게임</span>
              </div>
              <div className="countChip">
                <span className="countText">홀수 개수: {oddMin}~{oddMax}</span>
              </div>
              <div className="countChip">
                <span className="countText">저수 개수: {lowMin}~{lowMax}</span>
              </div>
              <div className="countChip">
                <span className="countText">
                  연속번호: {allowTwoConsecutive ? "2연속 허용 / 3연속 이상 제거" : "2연속도 제거"}
                </span>
              </div>
              <div className="countChip">
                <span className="countText">
                  과거 당첨번호 제외: {excludePastWinning ? "ON" : "OFF"}
                </span>
              </div>
              <div className="countChip">
                <span className="countText">
                  최근 번호 제외: {excludeRecentUsedNumbers ? `최근 ${recentExcludeCount}회` : "OFF"}
                </span>
              </div>
            </div>

            <p className="panelHint" style={{ marginTop: "18px" }}>
              역대 데이터:{" "}
              {loadingHistory
                ? "불러오는 중"
                : historyError
                ? "불러오기 실패"
                : `${history.length}회차 로드 완료`}
            </p>

            {excludeRecentUsedNumbers && !loadingHistory && !historyError && (
              <p className="panelHint" style={{ marginTop: "8px" }}>
                현재 사용 가능한 번호 수: {availablePool.length}개
              </p>
            )}

            {validationMessage ? (
              <p
                className="panelHint"
                style={{ color: "#ffb3b3", marginTop: "12px", fontWeight: 700 }}
              >
                {validationMessage}
              </p>
            ) : (
              <p className="panelHint" style={{ marginTop: "12px" }}>
                현재 조건으로 오름차순, 중복 없는 6개 번호만 생성됩니다.
              </p>
            )}

            {message && (
              <p
                className="panelHint"
                style={{
                  marginTop: "12px",
                  color: results.length > 0 ? "#9df0bf" : "#ffd08a",
                  fontWeight: 700,
                }}
              >
                {message}
              </p>
            )}
          </div>
        </div>

        <div className="panel resultWrap">
          <div className="panelHeader">
            <h3 className="panelTitle">생성 결과</h3>
            <div className="resultCount">
              {results.length}게임
              {results.length > 0 && <span className="resultSubText">조건 충족 결과</span>}
            </div>
          </div>

          <div className="tableWrap">
            <table className="resultTable">
              <thead>
                <tr>
                  <th>게임</th>
                  <th>번호</th>
                  <th>홀수</th>
                  <th>저수</th>
                  <th>연속길이</th>
                </tr>
              </thead>
              <tbody>
                {results.length === 0 ? (
                  <tr>
                    <td className="emptyRow" colSpan={5}>
                      생성된 번호가 없습니다.
                    </td>
                  </tr>
                ) : (
                  results.map((row, index) => (
                    <tr key={row.join("-")}>
                      <td>{index + 1}</td>
                      <td>
                        <div className="balls">
                          {row.map((num) => (
                            <span key={num} className={getBallClassName(num)}>
                              {num}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td>{countOdd(row)}</td>
                      <td>{countLow(row)}</td>
                      <td>{getMaxConsecutiveRun(row)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}