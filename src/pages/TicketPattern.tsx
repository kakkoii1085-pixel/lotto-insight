import { useEffect, useMemo, useState } from "react";

// ───────────── 타입 ─────────────
type LottoDraw = {
  round: number;
  date: string;
  numbers: number[];
  bonus: number;
};

// 로또 용지 행 정의: 1-10, 11-20, 21-30, 31-40, 41-45
const ROWS = [
  { label: "1행 (1-10)",  min: 1,  max: 10 },
  { label: "2행 (11-20)", min: 11, max: 20 },
  { label: "3행 (21-30)", min: 21, max: 30 },
  { label: "4행 (31-40)", min: 31, max: 40 },
  { label: "5행 (41-45)", min: 41, max: 45 },
];

// 열(컬럼) 정의: 1의 자리 (1,2,3,...,9,0)
const COLUMNS = [
  { digit: 1, label: "1의 자리" },
  { digit: 2, label: "2의 자리" },
  { digit: 3, label: "3의 자리" },
  { digit: 4, label: "4의 자리" },
  { digit: 5, label: "5의 자리" },
  { digit: 6, label: "6의 자리" },
  { digit: 7, label: "7의 자리" },
  { digit: 8, label: "8의 자리" },
  { digit: 9, label: "9의 자리" },
  { digit: 0, label: "0의 자리" },
];

// 숫자 → 행 인덱스(0-4)
function rowOf(n: number) {
  if (n <= 10) return 0;
  if (n <= 20) return 1;
  if (n <= 30) return 2;
  if (n <= 40) return 3;
  return 4;
}

// 숫자 → 열 인덱스 (1의 자리)
function columnOf(n: number) {
  return n % 10;
}

// 6개 번호 → 행별 개수 패턴 (예: [2,1,2,1,0])
function toRowPattern(nums: number[]): string {
  const cnt = [0, 0, 0, 0, 0];
  nums.forEach((n) => { cnt[rowOf(n)]++; });
  return cnt.join("-");
}

// 포아송 분포 PMF: P(k; λ) = e^(-λ) * λ^k / k!
function poissonPMF(lambda: number, k: number): number {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  let logP = -lambda + k * Math.log(lambda);
  for (let i = 2; i <= k; i++) logP -= Math.log(i);
  return Math.exp(logP);
}

// ────────── 데이터 로딩 ──────────
async function loadHistory(): Promise<LottoDraw[]> {
  const res = await fetch("/lotto_numbers.csv");
  const text = await res.text();
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length <= 1) return [];
  return lines.slice(1).map(line => {
    const cols = line.split(",");
    if (cols.length < 10) return null;
    const round = Number(cols[1]);
    const date = cols[2];
    const numbers = cols.slice(3, 9).map(Number);
    const bonus = Number(cols[9]);
    if ([round, ...numbers, bonus].some(isNaN)) return null;
    return { round, date, numbers, bonus };
  }).filter((d): d is LottoDraw => d !== null)
    .sort((a, b) => a.round - b.round);
}

// ────────── 분석 함수 ──────────
function analyzePatterns(draws: LottoDraw[]) {
  const counter: Record<string, number> = {};
  draws.forEach(d => {
    const pat = toRowPattern(d.numbers);
    counter[pat] = (counter[pat] ?? 0) + 1;
  });
  return Object.entries(counter)
    .map(([pattern, count]) => ({ pattern, count, pct: count / draws.length }))
    .sort((a, b) => b.count - a.count);
}

function analyzeByYear(draws: LottoDraw[]) {
  const byYear: Record<string, LottoDraw[]> = {};
  draws.forEach(d => {
    const y = d.date.slice(0, 4);
    if (!byYear[y]) byYear[y] = [];
    byYear[y].push(d);
  });
  return Object.entries(byYear)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([year, ys]) => ({
      year,
      count: ys.length,
      top: analyzePatterns(ys).slice(0, 10),
    }));
}

// ────────── 번호 생성 (패턴 기반) ──────────
function generateByPattern(patternStr: string): number[] {
  const rowCounts = patternStr.split("-").map(Number);
  const result: number[] = [];
  rowCounts.forEach((cnt, ri) => {
    const pool: number[] = [];
    for (let n = ROWS[ri].min; n <= ROWS[ri].max; n++) pool.push(n);
    // Fisher-Yates shuffle, pick cnt
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    result.push(...pool.slice(0, cnt));
  });
  return result.sort((a, b) => a - b);
}

// ────────── 여러 번호 세트 생성 ──────────
function generateMultipleSets(patternStr: string, count: number = 5): number[][] {
  return Array.from({ length: count }, () => generateByPattern(patternStr));
}

// ────────── 포아송 기대값 계산 ──────────
function computePoissonExpected(draws: LottoDraw[]) {
  // 각 행의 평균 출현 개수 계산
  const means = ROWS.map((_, ri) => {
    const total = draws.reduce((s, d) => s + d.numbers.filter(n => rowOf(n) === ri).length, 0);
    return total / draws.length;
  });
  return means;
}

// ────────── 공 색상 ──────────
function ballClass(n: number) {
  if (n <= 10) return "ball yellow";
  if (n <= 20) return "ball navy";
  if (n <= 30) return "ball red";
  if (n <= 40) return "ball gray";
  return "ball green";
}

// ────────── 저장 관련 ──────────
const STORAGE_KEY = "savedNumbers";
type SavedItem = {
  id: string;
  numbers: number[];
  bonus?: number | null;
  source?: string;
  createdAt: string;
  modeLabel?: string;
  note?: string;
};

function loadSaved(): SavedItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch { return []; }
}

function appendSaved(item: SavedItem) {
  const list = loadSaved();
  list.push(item);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

// ────────── TOP N 탭 ──────────
const TOP_TABS = [
  { label: "TOP 10",  n: 10  },
  { label: "TOP 30",  n: 30  },
  { label: "TOP 50",  n: 50  },
  { label: "TOP 100", n: 100 },
];

// ────────── 메인 컴포넌트 ──────────
export default function TicketPattern() {
  const [draws, setDraws] = useState<LottoDraw[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"overall" | "yearly" | "column">("overall");
  const [topN, setTopN] = useState(10);
  const [selectedYear, setSelectedYear] = useState<string>("ALL");
  const [generated, setGenerated] = useState<number[]>([]);
  const [savedMsg, setSavedMsg] = useState("");
  const [genNote, setGenNote] = useState("");
  const [multipleOptions, setMultipleOptions] = useState<number[][]>([]);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);

  useEffect(() => {
    loadHistory().then(d => { setDraws(d); setLoading(false); });
  }, []);

  // 전체 또는 특정 연도 필터
  const filteredDraws = useMemo(() => {
    if (selectedYear === "ALL") return draws;
    return draws.filter(d => d.date.slice(0, 4) === selectedYear);
  }, [draws, selectedYear]);

  const allPatterns = useMemo(() => analyzePatterns(filteredDraws), [filteredDraws]);
  const topPatterns = useMemo(() => allPatterns.slice(0, topN), [allPatterns, topN]);
  const yearlyData = useMemo(() => analyzeByYear(draws), [draws]);
  const poissonMeans = useMemo(() => computePoissonExpected(filteredDraws), [filteredDraws]);

  // 열 분석
  const years = useMemo(() => {
    const ys = new Set(draws.map(d => d.date.slice(0, 4)));
    return ["ALL", ...Array.from(ys).sort((a, b) => Number(b) - Number(a))];
  }, [draws]);

  function handleGenerate(patternStr: string) {
    const options = generateMultipleSets(patternStr, 5);
    setMultipleOptions(options);
    setSelectedOption(0);
    setGenerated(options[0]);
    setSavedMsg("");
  }

  function selectOption(idx: number) {
    if (idx >= 0 && idx < multipleOptions.length) {
      setSelectedOption(idx);
      setGenerated(multipleOptions[idx]);
      setSavedMsg("");
    }
  }

  function handleSave() {
    if (generated.length === 0) return;
    const item: SavedItem = {
      id: crypto.randomUUID(),
      numbers: generated,
      source: "generator",
      modeLabel: "용지패턴",
      note: genNote || undefined,
      createdAt: new Date().toISOString(),
    };
    appendSaved(item);
    setSavedMsg("구매메뉴에 저장되었습니다!");
    setTimeout(() => setSavedMsg(""), 3000);
  }

  if (loading) {
    return <div className="tp-page"><div className="history-loading">데이터 불러오는 중...</div></div>;
  }

  return (
    <div className="tp-page">
      {/* 헤더 */}
      <section className="history-header-card">
        <div>
          <p className="history-eyebrow">TICKET PATTERN</p>
          <h2 className="history-title">로또용지 행/열 패턴 분석</h2>
          <p className="history-subtitle">
            지류 로또용지 기준 행별(1행:1-10, 2행:11-20, …, 5행:41-45) 번호 분포 패턴을
            포아송 분포로 분석합니다. 가장 자주 출현한 패턴 TOP N을 확인하고 자동 번호를 생성할 수 있습니다.
          </p>
        </div>
      </section>

      {/* 포아송 λ(람다) 정보 */}
      <section className="panel tp-lambda-panel">
        <h3 className="panelTitle">포아송 분포 λ (행별 평균 출현 번호 수)</h3>
        <p className="panelSubText">
          {selectedYear === "ALL"
            ? `전체 ${draws.length}회 기준`
            : <><span className="tp-year-label">{selectedYear}년</span> {filteredDraws.length}회 기준</>}
        </p>
        <div className="tp-lambda-grid">
          {ROWS.map((row, ri) => {
            const lam = poissonMeans[ri];
            return (
              <div key={ri} className="tp-lambda-card">
                <div className="tp-lambda-label">{row.label}</div>
                <div className="tp-lambda-val">λ = {lam.toFixed(2)}</div>
                <div className="tp-lambda-bars">
                  {[0,1,2,3,4].map(k => (
                    <div key={k} className="tp-lambda-bar-row">
                      <span className="tp-lambda-k">{k}개</span>
                      <div className="barTrack">
                        <div
                          className="barFill"
                          style={{ width: `${Math.min(poissonPMF(lam, k) * 300, 100)}%` }}
                        />
                      </div>
                      <span className="tp-lambda-p">{(poissonPMF(lam, k) * 100).toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 탭 전환 */}
      <div className="tp-tab-row">
        <button
          className={`toggleBtn ${tab === "overall" ? "active" : ""}`}
          onClick={() => setTab("overall")}
        >행 패턴 분석</button>
        <button
          className={`toggleBtn ${tab === "column" ? "active" : ""}`}
          onClick={() => setTab("column")}
        >열 분석 (1의 자리)</button>
        <button
          className={`toggleBtn ${tab === "yearly" ? "active" : ""}`}
          onClick={() => setTab("yearly")}
        >연도별 TOP10</button>
      </div>

      {tab === "overall" && (
        <section className="panel">
          {/* 연도 필터 + TOP N 선택 */}
          <div className="tp-filter-row">
            <div className="tp-filter-group">
              <span className="fieldLabel">연도 필터</span>
              <select
                className="input tp-select"
                value={selectedYear}
                onChange={e => setSelectedYear(e.target.value)}
              >
                {years.map(y => (
                  <option key={y} value={y}>{y === "ALL" ? "전체" : `${y}년`}</option>
                ))}
              </select>
            </div>
            <div className="toggleGroup">
              {TOP_TABS.map(t => (
                <button
                  key={t.n}
                  className={`toggleBtn ${topN === t.n ? "active" : ""}`}
                  onClick={() => setTopN(t.n)}
                >{t.label}</button>
              ))}
            </div>
          </div>

          <p className="panelSubText" style={{ marginBottom: 16 }}>
            분석 대상: {filteredDraws.length}회 | 패턴 종류: {allPatterns.length}개
          </p>

          {/* 패턴 히트맵 */}
          <div className="tp-heatmap-section">
            <h4 className="tp-heatmap-title">패턴 빈도 히트맵</h4>
            <div className="tp-heatmap-grid">
              {topPatterns.slice(0, 30).map((p) => {
                const intensity = Math.min(1, p.count / topPatterns[0].count);
                return (
                  <div
                    key={p.pattern}
                    className="tp-heatmap-cell"
                    style={{
                      backgroundColor: `rgba(82, 122, 245, ${intensity * 0.6 + 0.2})`,
                      border: `1px solid rgba(82, 122, 245, ${intensity * 0.8})`
                    }}
                    title={`${p.pattern}: ${p.count}회 (${(p.pct * 100).toFixed(1)}%)`}
                  >
                    <div className="tp-heatmap-pattern">{p.pattern}</div>
                    <div className="tp-heatmap-count">{p.count}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 패턴 목록 */}
          <div className="tp-pattern-list">
            {topPatterns.map((p, idx) => (
              <div key={p.pattern} className="tp-pattern-row">
                <span className="tp-rank">#{idx + 1}</span>
                <div className="tp-pattern-badge">
                  {p.pattern.split("-").map((cnt, ri) => (
                    <span key={ri} className={`tp-badge-cell row${ri}`}>{cnt}</span>
                  ))}
                </div>
                <div className="barTrack tp-bar">
                  <div
                    className="barFill"
                    style={{ width: `${(p.count / topPatterns[0].count) * 100}%` }}
                  />
                </div>
                <span className="tp-count">{p.count}회 ({(p.pct * 100).toFixed(1)}%)</span>
                <button
                  className="subBtn tp-gen-btn"
                  onClick={() => handleGenerate(p.pattern)}
                >생성</button>
              </div>
            ))}
          </div>
        </section>
      )}

      {tab === "column" && (
        <section className="panel">
          <h3 className="panelTitle">열(1의 자리) 분석</h3>
          <p className="panelSubText" style={{ marginBottom: 16 }}>
            로또용지의 열별(1의 자리: 1,2,3,...,9,0) 번호 출현 빈도 분석
          </p>
          <div className="tp-column-grid">
            {COLUMNS.map(col => {
              const numsByDigit = filteredDraws
                .flatMap(d => d.numbers.filter(n => columnOf(n) === col.digit))
                .sort((a, b) => a - b);
              const uniqueNums = [...new Set(numsByDigit)];
              const maxFreq = Math.max(...uniqueNums.map(n =>
                filteredDraws.filter(d => d.numbers.includes(n)).length
              ), 1);
              return (
                <div key={col.digit} className="tp-column-card">
                  <div className="tp-column-header">{col.label} ({col.digit === 0 ? '10,20,30,40' : col.digit + ',1' + col.digit + ',2' + col.digit + ',3' + col.digit + ',4' + col.digit})</div>
                  <div className="tp-column-balls">
                    {uniqueNums.map(n => {
                      const freq = filteredDraws.filter(d => d.numbers.includes(n)).length;
                      const intensity = freq / maxFreq;
                      return (
                        <div
                          key={n}
                          className={`tp-column-ball ${ballClass(n)}`}
                          style={{
                            opacity: 0.4 + intensity * 0.6,
                            boxShadow: `0 0 ${intensity * 8}px rgba(255,255,255,${intensity * 0.5})`
                          }}
                          title={`${n}번: ${freq}회`}
                        >
                          {n}
                        </div>
                      );
                    })}
                  </div>
                  <div className="tp-column-stat">평균: {(numsByDigit.length / uniqueNums.length || 0).toFixed(1)}회</div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {tab === "yearly" && (
        <section className="panel">
          <h3 className="panelTitle">연도별 패턴 TOP 10</h3>
          <div className="tp-yearly-grid">
            {yearlyData.map(yd => (
              <div key={yd.year} className="tp-yearly-card">
                <div className="tp-yearly-header">{yd.year}년 ({yd.count}회)</div>
                {yd.top.map((p, i) => (
                  <div key={p.pattern} className="tp-yearly-row">
                    <span className="tp-rank-sm">#{i + 1}</span>
                    <div className="tp-pattern-badge-sm">
                      {p.pattern.split("-").map((cnt, ri) => (
                        <span key={ri} className={`tp-badge-cell-sm row${ri}`}>{cnt}</span>
                      ))}
                    </div>
                    <span className="tp-count-sm">{p.count}회</span>
                    <button
                      className="subBtn tp-gen-btn-sm"
                      onClick={() => handleGenerate(p.pattern)}
                    >생성</button>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 생성된 번호 & 저장 */}
      {generated.length > 0 && (
        <section className="panel tp-result-panel">
          <h3 className="panelTitle">생성된 번호</h3>

          {/* 다양한 옵션 선택 */}
          {multipleOptions.length > 0 && (
            <div className="tp-options-section">
              <p className="panelSubText">생성된 {multipleOptions.length}개 옵션 중 선택:</p>
              <div className="tp-options-grid">
                {multipleOptions.map((nums, idx) => (
                  <button
                    key={idx}
                    className={`tp-option-btn ${selectedOption === idx ? "selected" : ""}`}
                    onClick={() => selectOption(idx)}
                  >
                    <div className="tp-option-num">옵션 {idx + 1}</div>
                    <div className="balls" style={{ gap: 4, flexWrap: 'wrap', justifyContent: 'center' }}>
                      {nums.map(n => (
                        <span key={n} className={`${ballClass(n)} tp-option-ball`}>{n}</span>
                      ))}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 실제 로또용지 시각화 */}
          <div className="tp-ticket-section">
            <p className="panelSubText">실제 로또용지 시각화</p>
            <div className="tp-ticket-visual">
              {ROWS.map((row, ri) => (
                <div key={ri} className="tp-ticket-row">
                  <div className="tp-ticket-row-label">{row.label}</div>
                  <div className="tp-ticket-cells">
                    {Array.from({ length: row.max - row.min + 1 }, (_, i) => {
                      const num = row.min + i;
                      const isSelected = generated.includes(num);
                      return (
                        <div
                          key={num}
                          className={`tp-ticket-cell ${isSelected ? "selected" : ""} ${ballClass(num)}`}
                        >
                          {isSelected ? num : ""}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 생성된 번호 표시 */}
          <div className="balls" style={{ marginBottom: 16, marginTop: 16 }}>
            {generated.map(n => (
              <span key={n} className={ballClass(n)}>{n}</span>
            ))}
          </div>

          <div className="tp-save-row">
            <input
              className="input"
              type="text"
              placeholder="메모 (선택)"
              value={genNote}
              onChange={e => setGenNote(e.target.value)}
              style={{ maxWidth: 220 }}
            />
            <button className="primaryBtn" onClick={handleSave}>구매메뉴에 저장</button>
            {savedMsg && <span className="tp-saved-msg">{savedMsg}</span>}
          </div>
        </section>
      )}
    </div>
  );
}
