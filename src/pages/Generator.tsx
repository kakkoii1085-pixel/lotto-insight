import { useEffect, useMemo, useState } from "react";

type GeneratedRow = {
  numbers: number[];
  oddCount: number;
  lowCount: number;
  consecutiveText: string;
};

type ConsecutiveMode = "allow2_remove3" | "remove_all";

function parsePastCombinations(csvText: string): number[][] {
  const lines = csvText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const parsed: number[][] = [];

  for (const line of lines) {
    const nums = line
      .split(",")
      .map((v) => Number(v.trim()))
      .filter((v) => !Number.isNaN(v) && v >= 1 && v <= 45);

    if (nums.length >= 6) {
      parsed.push(nums.slice(0, 6).sort((a, b) => a - b));
    }
  }

  return parsed;
}

function countOdd(numbers: number[]) {
  return numbers.filter((n) => n % 2 === 1).length;
}

function countLow(numbers: number[]) {
  return numbers.filter((n) => n <= 22).length;
}

function getConsecutiveRunInfo(numbers: number[]) {
  let maxRun = 1;
  let currentRun = 1;
  let pairCount = 0;

  for (let i = 1; i < numbers.length; i++) {
    if (numbers[i] === numbers[i - 1] + 1) {
      currentRun += 1;
      pairCount += 1;
      if (currentRun > maxRun) maxRun = currentRun;
    } else {
      currentRun = 1;
    }
  }

  return { maxRun, pairCount };
}

function consecutiveLabel(numbers: number[]) {
  const parts: string[] = [];
  for (let i = 1; i < numbers.length; i++) {
    if (numbers[i] === numbers[i - 1] + 1) {
      parts.push(`${numbers[i - 1]}-${numbers[i]}`);
    }
  }
  return parts.length > 0 ? parts.join(", ") : "-";
}

function generateOneSet(): number[] {
  const set = new Set<number>();
  while (set.size < 6) {
    set.add(Math.floor(Math.random() * 45) + 1);
  }
  return [...set].sort((a, b) => a - b);
}

function ballClass(num: number) {
  if (num <= 10) return "ball yellow";
  if (num <= 20) return "ball blue";
  if (num <= 30) return "ball red";
  if (num <= 40) return "ball gray";
  return "ball green";
}

export default function Generator() {
  const [gameCount, setGameCount] = useState(5);
  const [oddMin, setOddMin] = useState(2);
  const [oddMax, setOddMax] = useState(4);
  const [lowMin, setLowMin] = useState(2);
  const [lowMax, setLowMax] = useState(4);
  const [consecutiveMode, setConsecutiveMode] =
    useState<ConsecutiveMode>("allow2_remove3");
  const [excludePast, setExcludePast] = useState(true);
  const [excludeRecent, setExcludeRecent] = useState(false);

  const [pastCombinations, setPastCombinations] = useState<number[][]>([]);
  const [generated, setGenerated] = useState<GeneratedRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/lotto_1_1213_numbers.csv")
      .then((res) => res.text())
      .then((csvText) => {
        setPastCombinations(parsePastCombinations(csvText));
        setLoading(false);
      })
      .catch(() => {
        setPastCombinations([]);
        setLoading(false);
      });
  }, []);

  const pastSet = useMemo(() => {
    return new Set(pastCombinations.map((row) => row.join("-")));
  }, [pastCombinations]);

  const recentSet = useMemo(() => {
    return new Set(pastCombinations.slice(0, 10).map((row) => row.join("-")));
  }, [pastCombinations]);

  const filterSummary = useMemo(() => {
    return [
      `게임 수: ${gameCount}게임`,
      `홀수 개수: ${oddMin}~${oddMax}`,
      `저수 개수: ${lowMin}~${lowMax}`,
      `연속번호: ${
        consecutiveMode === "allow2_remove3"
          ? "2연속 허용 / 3연속 이상 제거"
          : "연속번호 전부 제거"
      }`,
      `과거 당첨번호 제외: ${excludePast ? "ON" : "OFF"}`,
      `최근 번호 제외: ${excludeRecent ? "ON" : "OFF"}`,
      `역대 데이터: ${pastCombinations.length}개 조합 로드`,
    ];
  }, [
    gameCount,
    oddMin,
    oddMax,
    lowMin,
    lowMax,
    consecutiveMode,
    excludePast,
    excludeRecent,
    pastCombinations.length,
  ]);

  const isValidSet = (numbers: number[]) => {
    const oddCount = countOdd(numbers);
    const lowCount = countLow(numbers);
    const { maxRun } = getConsecutiveRunInfo(numbers);

    if (oddCount < oddMin || oddCount > oddMax) return false;
    if (lowCount < lowMin || lowCount > lowMax) return false;

    if (consecutiveMode === "allow2_remove3" && maxRun >= 3) return false;
    if (consecutiveMode === "remove_all" && maxRun >= 2) return false;

    const key = numbers.join("-");

    if (excludePast && pastSet.has(key)) return false;
    if (excludeRecent && recentSet.has(key)) return false;

    return true;
  };

  const handleGenerate = () => {
    const results: GeneratedRow[] = [];
    const localSet = new Set<string>();
    let attempts = 0;
    const maxAttempts = 300000;

    while (results.length < gameCount && attempts < maxAttempts) {
      attempts += 1;
      const numbers = generateOneSet();
      const key = numbers.join("-");

      if (localSet.has(key)) continue;
      if (!isValidSet(numbers)) continue;

      localSet.add(key);
      results.push({
        numbers,
        oddCount: countOdd(numbers),
        lowCount: countLow(numbers),
        consecutiveText: consecutiveLabel(numbers),
      });
    }

    setGenerated(results);
  };

  const handleReset = () => {
    setGameCount(5);
    setOddMin(2);
    setOddMax(4);
    setLowMin(2);
    setLowMax(4);
    setConsecutiveMode("allow2_remove3");
    setExcludePast(true);
    setExcludeRecent(false);
    setGenerated([]);
  };

  const handleCopy = async () => {
    if (generated.length === 0) return;

    const text = generated
      .map((row, idx) => `${idx + 1}게임: ${row.numbers.join(", ")}`)
      .join("\n");

    try {
      await navigator.clipboard.writeText(text);
      alert("번호를 복사했습니다.");
    } catch {
      alert("복사에 실패했습니다.");
    }
  };

  return (
    <div className="container">
      <div className="card">
        <h1 className="page-title">번호 생성기</h1>
        <p className="page-desc">조건 기반 전략형 로또 번호 생성</p>

        {loading ? (
          <p className="empty-text">역대 데이터를 불러오는 중...</p>
        ) : (
          <>
            <h2 className="section-title">생성 옵션</h2>

            <div className="form-grid">
              <div className="form-item">
                <label>게임 수</label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={gameCount}
                  onChange={(e) => setGameCount(Number(e.target.value))}
                />
              </div>

              <div className="form-item">
                <label>홀수 최소</label>
                <input
                  type="number"
                  min={0}
                  max={6}
                  value={oddMin}
                  onChange={(e) => setOddMin(Number(e.target.value))}
                />
              </div>

              <div className="form-item">
                <label>홀수 최대</label>
                <input
                  type="number"
                  min={0}
                  max={6}
                  value={oddMax}
                  onChange={(e) => setOddMax(Number(e.target.value))}
                />
              </div>

              <div className="form-item">
                <label>저수(1~22) 최소</label>
                <input
                  type="number"
                  min={0}
                  max={6}
                  value={lowMin}
                  onChange={(e) => setLowMin(Number(e.target.value))}
                />
              </div>

              <div className="form-item">
                <label>저수(1~22) 최대</label>
                <input
                  type="number"
                  min={0}
                  max={6}
                  value={lowMax}
                  onChange={(e) => setLowMax(Number(e.target.value))}
                />
              </div>

              <div className="form-item">
                <label>연속번호 제한</label>
                <select
                  value={consecutiveMode}
                  onChange={(e) =>
                    setConsecutiveMode(e.target.value as ConsecutiveMode)
                  }
                >
                  <option value="allow2_remove3">2연속 허용 / 3연속 이상 제거</option>
                  <option value="remove_all">연속번호 전부 제거</option>
                </select>
              </div>

              <div className="form-item">
                <label>과거 당첨번호 제외</label>
                <select
                  value={excludePast ? "yes" : "no"}
                  onChange={(e) => setExcludePast(e.target.value === "yes")}
                >
                  <option value="yes">제외함</option>
                  <option value="no">제외 안함</option>
                </select>
              </div>

              <div className="form-item">
                <label>최근 N회 번호 제외 사용</label>
                <select
                  value={excludeRecent ? "yes" : "no"}
                  onChange={(e) => setExcludeRecent(e.target.value === "yes")}
                >
                  <option value="no">사용 안함</option>
                  <option value="yes">최근 10개 조합 제외</option>
                </select>
              </div>
            </div>

            <p className="form-help">
              홀짝, 저고, 연속번호, 과거 조합, 최근 출현번호 조건을 동시에 적용합니다.
            </p>

            <div className="btn-row">
              <button onClick={handleGenerate}>번호 생성</button>
              <button className="secondary" onClick={handleCopy}>
                번호 복사
              </button>
              <button className="secondary" onClick={handleReset}>
                초기화
              </button>
            </div>
          </>
        )}
      </div>

      <div className="card">
        <h2 className="section-title">현재 필터 요약</h2>
        <ul className="summary-list">
          {filterSummary.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>

      <div className="card">
        <h2 className="section-title">생성 결과</h2>

        {generated.length === 0 ? (
          <p className="empty-text">생성된 번호가 없습니다.</p>
        ) : (
          <div className="result-table-wrap">
            <table className="result-table">
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
                {generated.map((row, idx) => (
                  <tr key={row.numbers.join("-")}>
                    <td>{idx + 1}게임</td>
                    <td>
                      <div className="ball-row">
                        {row.numbers.map((num) => (
                          <span key={num} className={ballClass(num)}>
                            {num}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td>{row.oddCount}</td>
                    <td>{row.lowCount}</td>
                    <td>{row.consecutiveText}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {generated.length < gameCount && generated.length > 0 && (
          <p className="form-help">
            현재 조건이 다소 엄격해 요청한 게임 수보다 적게 생성될 수 있습니다.
          </p>
        )}
      </div>
    </div>
  );
}