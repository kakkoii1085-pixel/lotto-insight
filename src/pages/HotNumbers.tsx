import { useEffect, useMemo, useRef, useState } from "react";

type LottoRow = {
  round: number;
  date: string;
  numbers: number[];
  bonus: number;
};

type RangeMode =
  | "all"
  | "recent100"
  | "recent50"
  | "recent30"
  | "recent10"
  | `year-${number}`;

type CandidateItem = {
  number: number;
  count: number;
};

type SavedNumberItem = {
  id: string;
  numbers: number[];
  bonus?: number | null;
  source?: "simulator" | "generator" | string;
  createdAt: string;
  modeLabel?: string;
  note?: string;
};

function getBallClass(num: number) {
  if (num <= 10) return "ball yellow";
  if (num <= 20) return "ball navy";
  if (num <= 30) return "ball red";
  if (num <= 40) return "ball gray";
  return "ball green";
}

function parseCsv(text: string): LottoRow[] {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length <= 1) return [];

  const rows: LottoRow[] = [];

  for (let i = 1; i < lines.length; i += 1) {
    const cols = lines[i].split(",").map((v) => v.trim());
    if (cols.length < 9) continue;

    const round = Number(cols[0]);
    const date = cols[1];
    const numbers = cols.slice(2, 8).map(Number).filter((n) => !Number.isNaN(n));
    const bonus = Number(cols[8]);

    if (!round || !date || numbers.length !== 6 || Number.isNaN(bonus)) continue;

    rows.push({
      round,
      date,
      numbers,
      bonus,
    });
  }

  return rows.sort((a, b) => b.round - a.round);
}

function getModeLabel(mode: RangeMode) {
  if (mode === "all") return "전체 기준";
  if (mode === "recent100") return "최근 100회 기준";
  if (mode === "recent50") return "최근 50회 기준";
  if (mode === "recent30") return "최근 30회 기준";
  if (mode === "recent10") return "최근 10회 기준";
  if (mode.startsWith("year-")) return `${mode.replace("year-", "")}년 기준`;
  return "전체 기준";
}

function filterRowsByMode(rows: LottoRow[], mode: RangeMode) {
  if (mode === "all") return rows;
  if (mode === "recent100") return rows.slice(0, 100);
  if (mode === "recent50") return rows.slice(0, 50);
  if (mode === "recent30") return rows.slice(0, 30);
  if (mode === "recent10") return rows.slice(0, 10);

  if (mode.startsWith("year-")) {
    const year = Number(mode.replace("year-", ""));
    return rows.filter((row) => new Date(row.date).getFullYear() === year);
  }

  return rows;
}

function buildCandidates(rows: LottoRow[]): CandidateItem[] {
  const countMap = new Map<number, number>();

  for (const row of rows) {
    for (const num of row.numbers) {
      countMap.set(num, (countMap.get(num) ?? 0) + 1);
    }
  }

  const arr: CandidateItem[] = Array.from({ length: 45 }, (_, i) => ({
    number: i + 1,
    count: countMap.get(i + 1) ?? 0,
  }));

  return arr.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return a.number - b.number;
  });
}

function pickWeightedNumber(pool: CandidateItem[], excluded: number[]) {
  const filtered = pool.filter((item) => !excluded.includes(item.number));
  const totalWeight = filtered.reduce((sum, item) => sum + Math.max(item.count, 1), 0);

  if (filtered.length === 0 || totalWeight <= 0) return null;

  let random = Math.random() * totalWeight;

  for (const item of filtered) {
    random -= Math.max(item.count, 1);
    if (random <= 0) return item.number;
  }

  return filtered[filtered.length - 1]?.number ?? null;
}

function getYearOptions(rows: LottoRow[]) {
  const years = Array.from(
    new Set(rows.map((row) => new Date(row.date).getFullYear()).filter(Boolean))
  ).sort((a, b) => b - a);

  return years;
}

function makeSavePayload(numbers: number[], modeLabel: string): SavedNumberItem {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    numbers: [...numbers].sort((a, b) => a - b),
    bonus: null,
    source: "simulator",
    createdAt: new Date().toISOString(),
    modeLabel,
    note: "TOP100 후보군 기반 추첨 시뮬레이터 저장",
  };
}

function writeToStorage(keys: string[], payload: SavedNumberItem) {
  for (const key of keys) {
    try {
      const raw = localStorage.getItem(key);
      const parsed = raw ? JSON.parse(raw) : [];
      const next = Array.isArray(parsed) ? [payload, ...parsed] : [payload];
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      localStorage.setItem(key, JSON.stringify([payload]));
    }
  }
}

export default function HotNumbers() {
  const [rows, setRows] = useState<LottoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [mode, setMode] = useState<RangeMode>("all");
  const [yearValue, setYearValue] = useState<string>("");

  const [rollingNumber, setRollingNumber] = useState<number | null>(null);
  const [resultNumbers, setResultNumbers] = useState<number[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [savedMessage, setSavedMessage] = useState("");

  const timersRef = useRef<number[]>([]);

  useEffect(() => {
    fetch("/lotto_numbers.csv")
      .then((res) => {
        if (!res.ok) throw new Error("CSV 파일을 불러오지 못했습니다.");
        return res.text();
      })
      .then((text) => {
        const parsed = parseCsv(text);
        setRows(parsed);
      })
      .catch(() => {
        setError("로또 데이터를 불러오지 못했습니다.");
      })
      .finally(() => {
        setLoading(false);
      });

    return () => {
      timersRef.current.forEach((id) => window.clearTimeout(id));
      timersRef.current = [];
    };
  }, []);

  const yearOptions = useMemo(() => getYearOptions(rows), [rows]);

  useEffect(() => {
    if (!yearOptions.length) return;
    if (!yearValue) {
      setYearValue(String(yearOptions[0]));
    }
  }, [yearOptions, yearValue]);

  const effectiveMode = useMemo<RangeMode>(() => {
    if (mode === "all") return "all";
    if (mode === "recent100") return "recent100";
    if (mode === "recent50") return "recent50";
    if (mode === "recent30") return "recent30";
    if (mode === "recent10") return "recent10";
    if (mode.startsWith("year-")) {
      const year = Number(yearValue || mode.replace("year-", ""));
      return `year-${year}`;
    }
    return "all";
  }, [mode, yearValue]);

  const filteredRows = useMemo(() => {
    return filterRowsByMode(rows, effectiveMode);
  }, [rows, effectiveMode]);

  const candidates = useMemo(() => {
    const allCandidates = buildCandidates(filteredRows);
    return allCandidates.slice(0, 45);
  }, [filteredRows]);

  const top100Candidates = useMemo(() => {
    return candidates.slice(0, Math.min(45, 100));
  }, [candidates]);

  const modeLabel = useMemo(() => getModeLabel(effectiveMode), [effectiveMode]);

  const latestRound = rows[0];

  const candidateLookup = useMemo(() => {
    const map = new Map<number, number>();
    for (const item of top100Candidates) {
      map.set(item.number, item.count);
    }
    return map;
  }, [top100Candidates]);

  const clearTimers = () => {
    timersRef.current.forEach((id) => window.clearTimeout(id));
    timersRef.current = [];
  };

  const handleDrawStart = () => {
    if (isDrawing || !top100Candidates.length) return;

    clearTimers();
    setSavedMessage("");
    setIsDrawing(true);
    setResultNumbers([]);
    setRollingNumber(null);

    const picked: number[] = [];

    for (let step = 0; step < 6; step += 1) {
      const startDelay = step * 1200;
      const finalizeDelay = startDelay + 950;

      for (let tick = 0; tick < 16; tick += 1) {
        const rollDelay = startDelay + tick * 55;

        const timerId = window.setTimeout(() => {
          const available = top100Candidates.filter(
            (item) => !picked.includes(item.number)
          );
          if (!available.length) return;

          const randomPick =
            available[Math.floor(Math.random() * available.length)].number;
          setRollingNumber(randomPick);
        }, rollDelay);

        timersRef.current.push(timerId);
      }

      const finalizeTimerId = window.setTimeout(() => {
        const chosen = pickWeightedNumber(top100Candidates, picked);

        if (chosen == null) return;

        picked.push(chosen);
        const sorted = [...picked].sort((a, b) => a - b);

        setRollingNumber(chosen);
        setResultNumbers(sorted);

        if (step === 5) {
          const endTimerId = window.setTimeout(() => {
            setRollingNumber(null);
            setIsDrawing(false);
          }, 400);
          timersRef.current.push(endTimerId);
        }
      }, finalizeDelay);

      timersRef.current.push(finalizeTimerId);
    }
  };

  const handleRedraw = () => {
    if (isDrawing) return;
    handleDrawStart();
  };

  const handleSave = () => {
    if (isDrawing || resultNumbers.length !== 6) return;

    const payload = makeSavePayload(resultNumbers, modeLabel);

    writeToStorage(["savedNumbers"], payload);

    window.dispatchEvent(new Event("storage"));
    setSavedMessage("저장 완료");
    window.setTimeout(() => setSavedMessage(""), 1600);
  };

  if (loading) {
    return (
      <div className="sim-page">
        <div className="sim-loading">데이터를 불러오는 중입니다...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="sim-page">
        <div className="sim-error">{error}</div>
      </div>
    );
  }

  return (
    <div className="sim-page">
      <section className="sim-hero">
        <div>
          <div className="sim-kicker">HOT NUMBER DRAW</div>
          <h2 className="sim-title">추천 추첨기</h2>
          <p className="sim-desc">
            전체 / 연도 / 최근 회차 기준으로 자주 나온 번호를 집계하고,
            TOP 100 후보군 기반으로 6개 번호를 순차 추첨합니다.
          </p>
        </div>

        <div className="sim-latest-box">
          <div className="sim-latest-label">최신 추첨 기준</div>
          <div className="sim-latest-round">
            {latestRound ? `${latestRound.round}회` : "-"}
          </div>
          <div className="sim-latest-date">{latestRound?.date ?? "-"}</div>
        </div>
      </section>

      <section className="sim-filter-card">
        <div className="sim-filter-top">
          <div className="sim-filter-title">기준 선택</div>
          <div className="sim-filter-sub">
            후보군은 선택 기준으로 집계한 출현 빈도 상위 번호를 사용합니다.
          </div>
        </div>

        <div className="sim-filter-row">
          <button
            className={`sim-chip ${mode === "all" ? "active" : ""}`}
            onClick={() => setMode("all")}
          >
            전체
          </button>

          <div className="sim-year-wrap">
            <button
              className={`sim-chip ${mode.startsWith("year-") ? "active" : ""}`}
              onClick={() => setMode(`year-${Number(yearValue || yearOptions[0] || 2026)}`)}
            >
              연도 기준
            </button>

            <select
              className="sim-year-select"
              value={yearValue}
              onChange={(e) => {
                setYearValue(e.target.value);
                setMode(`year-${Number(e.target.value)}`);
              }}
            >
              {yearOptions.map((year) => (
                <option key={year} value={year}>
                  {year}년
                </option>
              ))}
            </select>
          </div>

          <button
            className={`sim-chip ${mode === "recent100" ? "active" : ""}`}
            onClick={() => setMode("recent100")}
          >
            최근 100회
          </button>

          <button
            className={`sim-chip ${mode === "recent50" ? "active" : ""}`}
            onClick={() => setMode("recent50")}
          >
            최근 50회
          </button>

          <button
            className={`sim-chip ${mode === "recent30" ? "active" : ""}`}
            onClick={() => setMode("recent30")}
          >
            최근 30회
          </button>

          <button
            className={`sim-chip ${mode === "recent10" ? "active" : ""}`}
            onClick={() => setMode("recent10")}
          >
            최근 10회
          </button>
        </div>
      </section>

      <section className="sim-main-grid">
        <div className="sim-machine-card">
          <div className="sim-machine-top">
            <div className="sim-machine-title">HOT NUMBER DRAW</div>
            <div className="sim-mode-pill">{modeLabel}</div>
          </div>

          <div className="sim-machine-body">
            <div className="sim-glass">
              <div className={`sim-rolling-core ${isDrawing ? "drawing" : ""}`}>
                <span>{rollingNumber ?? "?"}</span>
              </div>

              <div className="sim-glass-balls">
                {top100Candidates.slice(0, 14).map((item) => (
                  <div
                    key={item.number}
                    className={`sim-mini-ball ${getBallClass(item.number).replace("ball ", "")}`}
                  >
                    {item.number}
                  </div>
                ))}
              </div>
            </div>

            <div className="sim-progress">
              <div className="sim-progress-label">
                {isDrawing ? "번호를 추첨 중입니다" : "추첨 대기 상태"}
              </div>
              <div className="sim-progress-dots">
                {Array.from({ length: 6 }).map((_, idx) => (
                  <span
                    key={idx}
                    className={idx < resultNumbers.length ? "filled" : ""}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="sim-result-strip">
            {Array.from({ length: 6 }).map((_, idx) => {
              const num = resultNumbers[idx];
              return (
                <div
                  key={idx}
                  className={`sim-result-slot ${num ? getBallClass(num).replace("ball ", "") : ""}`}
                >
                  {num ?? ""}
                </div>
              );
            })}
          </div>

          <div className="sim-machine-note">
            후보군: {modeLabel} / TOP 100 기준 사용
          </div>

          <div className="sim-action-row">
            <button className="sim-action primary" onClick={handleDrawStart} disabled={isDrawing}>
              추첨 시작
            </button>

            <button className="sim-action" onClick={handleRedraw} disabled={isDrawing}>
              다시 추첨
            </button>

            <button
              className="sim-action"
              onClick={handleSave}
              disabled={isDrawing || resultNumbers.length !== 6}
            >
              저장하기
            </button>
          </div>

          {savedMessage && <div className="sim-saved-message">{savedMessage}</div>}
        </div>

        <div className="sim-side-card">
          <div className="sim-side-section">
            <div className="sim-side-title">추첨 결과</div>
            <div className="sim-final-balls">
              {resultNumbers.length ? (
                resultNumbers.map((num) => (
                  <div key={num} className={`sim-final-ball ${getBallClass(num).replace("ball ", "")}`}>
                    {num}
                  </div>
                ))
              ) : (
                <div className="sim-empty-text">아직 추첨된 번호가 없습니다.</div>
              )}
            </div>
          </div>

          <div className="sim-side-section">
            <div className="sim-side-title">각 번호 출현 횟수</div>
            <div className="sim-count-grid">
              {resultNumbers.length ? (
                resultNumbers.map((num) => (
                  <div key={num} className="sim-count-item">
                    <div className={`sim-count-ball ${getBallClass(num).replace("ball ", "")}`}>
                      {num}
                    </div>
                    <div className="sim-count-text">
                      {candidateLookup.get(num) ?? 0}회
                    </div>
                  </div>
                ))
              ) : (
                <div className="sim-empty-text">추첨 후 출현 횟수가 표시됩니다.</div>
              )}
            </div>
          </div>

          <div className="sim-side-section">
            <div className="sim-side-title">TOP 후보 번호</div>
            <div className="sim-top-grid">
              {top100Candidates.map((item) => (
                <div key={item.number} className="sim-top-item">
                  <div className={`sim-top-ball ${getBallClass(item.number).replace("ball ", "")}`}>
                    {item.number}
                  </div>
                  <div className="sim-top-count">{item.count}회</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <style>{`
        .sim-page {
          width: 100%;
          max-width: 1320px;
          margin: 0 auto;
          padding: 22px 20px 60px;
          color: rgba(255,255,255,0.95);
        }

        .sim-loading,
        .sim-error {
          min-height: 300px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 24px;
          border: 1px solid rgba(255,255,255,0.08);
          background: linear-gradient(180deg, rgba(15,23,46,0.92), rgba(9,15,34,0.96));
          font-size: 22px;
          font-weight: 700;
        }

        .sim-hero {
          display: flex;
          justify-content: space-between;
          gap: 20px;
          align-items: stretch;
          margin-bottom: 18px;
        }

        .sim-kicker {
          font-size: 12px;
          font-weight: 800;
          letter-spacing: 0.16em;
          color: rgba(132,163,255,0.92);
          margin-bottom: 8px;
        }

        .sim-title {
          margin: 0;
          font-size: clamp(30px, 4vw, 42px);
          line-height: 1.1;
          font-weight: 900;
        }

        .sim-desc {
          margin: 12px 0 0;
          font-size: 18px;
          line-height: 1.65;
          color: rgba(225,231,255,0.82);
        }

        .sim-latest-box {
          min-width: 240px;
          padding: 18px 20px;
          border-radius: 22px;
          border: 1px solid rgba(126,152,255,0.24);
          background: linear-gradient(180deg, rgba(26,39,82,0.88), rgba(14,23,48,0.96));
          box-shadow: 0 14px 38px rgba(0,0,0,0.24);
        }

        .sim-latest-label {
          font-size: 13px;
          color: rgba(208,220,255,0.78);
          margin-bottom: 8px;
        }

        .sim-latest-round {
          font-size: 34px;
          font-weight: 900;
          margin-bottom: 4px;
        }

        .sim-latest-date {
          font-size: 16px;
          color: rgba(223,230,255,0.8);
        }

        .sim-filter-card,
        .sim-machine-card,
        .sim-side-card {
          border-radius: 28px;
          border: 1px solid rgba(255,255,255,0.08);
          background: linear-gradient(180deg, rgba(18,29,63,0.94), rgba(10,16,35,0.98));
          box-shadow:
            0 18px 50px rgba(0,0,0,0.26),
            inset 0 1px 0 rgba(255,255,255,0.05);
        }

        .sim-filter-card {
          padding: 18px 18px 20px;
          margin-bottom: 18px;
        }

        .sim-filter-top {
          margin-bottom: 14px;
        }

        .sim-filter-title {
          font-size: 24px;
          font-weight: 900;
        }

        .sim-filter-sub {
          margin-top: 6px;
          font-size: 15px;
          color: rgba(223,230,255,0.76);
        }

        .sim-filter-row {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          align-items: center;
        }

        .sim-chip {
          height: 48px;
          padding: 0 18px;
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 999px;
          background: rgba(17,25,52,0.9);
          color: rgba(255,255,255,0.9);
          font-size: 16px;
          font-weight: 800;
          cursor: pointer;
          transition: 0.2s ease;
        }

        .sim-chip:hover {
          transform: translateY(-1px);
          border-color: rgba(137,164,255,0.38);
        }

        .sim-chip.active {
          background: linear-gradient(180deg, rgba(87,123,255,0.96), rgba(63,90,205,0.96));
          border-color: rgba(159,182,255,0.48);
          box-shadow: 0 10px 24px rgba(50,84,195,0.26);
        }

        .sim-year-wrap {
          display: flex;
          gap: 8px;
          align-items: center;
        }

        .sim-year-select {
          height: 48px;
          min-width: 132px;
          padding: 0 14px;
          border-radius: 14px;
          border: 1px solid rgba(255,255,255,0.08);
          background: rgba(11,18,39,0.95);
          color: white;
          font-size: 15px;
          font-weight: 700;
          outline: none;
        }

        .sim-main-grid {
          display: grid;
          grid-template-columns: minmax(0, 1.55fr) minmax(360px, 0.95fr);
          gap: 18px;
        }

        .sim-machine-card {
          padding: 20px;
        }

        .sim-machine-top {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          align-items: center;
          margin-bottom: 16px;
        }

        .sim-machine-title {
          font-size: 28px;
          font-weight: 900;
          letter-spacing: 0.03em;
        }

        .sim-mode-pill {
          padding: 10px 14px;
          border-radius: 999px;
          background: rgba(33,48,99,0.92);
          border: 1px solid rgba(119,147,255,0.26);
          font-size: 14px;
          font-weight: 800;
          color: rgba(232,238,255,0.95);
        }

        .sim-machine-body {
          padding: 22px;
          border-radius: 24px;
          background: radial-gradient(circle at 50% 20%, rgba(34,58,124,0.55), rgba(7,12,28,0.96));
          border: 1px solid rgba(255,255,255,0.07);
        }

        .sim-glass {
          position: relative;
          min-height: 360px;
          border-radius: 34px;
          border: 1px solid rgba(147,170,255,0.22);
          background:
            radial-gradient(circle at 30% 25%, rgba(255,255,255,0.16), transparent 30%),
            radial-gradient(circle at 70% 75%, rgba(93,123,255,0.16), transparent 28%),
            linear-gradient(180deg, rgba(16,24,51,0.88), rgba(8,13,30,0.96));
          overflow: hidden;
          box-shadow:
            inset 0 0 40px rgba(85,121,255,0.12),
            0 16px 40px rgba(0,0,0,0.34);
        }

        .sim-rolling-core {
          position: absolute;
          inset: 50% auto auto 50%;
          width: 150px;
          aspect-ratio: 1 / 1;
          height: auto;
          transform: translate(-50%, -50%);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          background:
            radial-gradient(circle at 30% 30%, rgba(255,255,255,0.24), transparent 26%),
            linear-gradient(180deg, rgba(79,127,255,0.98), rgba(44,76,205,0.98));
          border: 4px solid rgba(181,198,255,0.42);
          box-shadow:
            0 0 36px rgba(92,126,255,0.38),
            inset 0 10px 18px rgba(255,255,255,0.12);
          z-index: 2;
        }

        .sim-rolling-core span {
          font-size: 62px;
          font-weight: 900;
          color: white;
          text-shadow: 0 6px 14px rgba(0,0,0,0.35);
        }

        .sim-rolling-core.drawing {
          animation: simPulse 0.55s ease-in-out infinite;
        }

        @keyframes simPulse {
          0% { transform: translate(-50%, -50%) scale(1); }
          50% { transform: translate(-50%, -50%) scale(1.06); }
          100% { transform: translate(-50%, -50%) scale(1); }
        }

        .sim-glass-balls {
          position: absolute;
          inset: 0;
          pointer-events: none;
        }

        .sim-mini-ball {
          position: absolute;
          width: 54px;
          aspect-ratio: 1 / 1;
          height: auto;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 22px;
          font-weight: 900;
          color: #fff;
          box-shadow: 0 10px 20px rgba(0,0,0,0.28);
          opacity: 0.9;
        }

        .sim-mini-ball:nth-child(1) { top: 28px; left: 10%; }
        .sim-mini-ball:nth-child(2) { top: 66px; left: 24%; }
        .sim-mini-ball:nth-child(3) { top: 20px; left: 38%; }
        .sim-mini-ball:nth-child(4) { top: 72px; left: 60%; }
        .sim-mini-ball:nth-child(5) { top: 32px; right: 12%; }
        .sim-mini-ball:nth-child(6) { top: 150px; left: 12%; }
        .sim-mini-ball:nth-child(7) { top: 196px; left: 24%; }
        .sim-mini-ball:nth-child(8) { top: 136px; left: 72%; }
        .sim-mini-ball:nth-child(9) { top: 224px; right: 10%; }
        .sim-mini-ball:nth-child(10) { bottom: 44px; left: 12%; }
        .sim-mini-ball:nth-child(11) { bottom: 88px; left: 36%; }
        .sim-mini-ball:nth-child(12) { bottom: 36px; left: 54%; }
        .sim-mini-ball:nth-child(13) { bottom: 90px; right: 18%; }
        .sim-mini-ball:nth-child(14) { bottom: 28px; right: 8%; }

        .sim-progress {
          margin-top: 18px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 14px;
        }

        .sim-progress-label {
          font-size: 18px;
          font-weight: 800;
          color: rgba(233,237,255,0.88);
        }

        .sim-progress-dots {
          display: flex;
          gap: 8px;
          align-items: center;
        }

        .sim-progress-dots span {
          width: 14px;
          aspect-ratio: 1 / 1;
          height: auto;
          border-radius: 50%;
          background: rgba(255,255,255,0.16);
          border: 1px solid rgba(255,255,255,0.08);
          display: block;
        }

        .sim-progress-dots span.filled {
          background: linear-gradient(180deg, rgba(102,141,255,1), rgba(64,98,225,1));
          box-shadow: 0 0 12px rgba(92,123,255,0.44);
        }

        .sim-result-strip {
          margin-top: 18px;
          display: flex;
          flex-wrap: wrap;
          gap: 18px;
          align-items: center;
        }

        .sim-result-slot,
        .sim-final-ball,
        .sim-count-ball,
        .sim-top-ball {
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 900;
          color: #fff;
        }

        .sim-result-slot {
          width: 72px;
          aspect-ratio: 1 / 1;
          height: auto;
          font-size: 28px;
          background: rgba(255,255,255,0.06);
          border: 1px dashed rgba(255,255,255,0.12);
          flex: 0 0 72px;
        }

        .sim-machine-note {
          margin-top: 16px;
          font-size: 15px;
          color: rgba(220,229,255,0.78);
        }

        .sim-action-row {
          display: grid;
          grid-template-columns: 1.2fr 0.8fr 0.8fr;
          gap: 12px;
          margin-top: 18px;
        }

        .sim-action {
          height: 64px;
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 18px;
          background: rgba(18,26,54,0.96);
          color: white;
          font-size: 22px;
          font-weight: 900;
          cursor: pointer;
          transition: 0.2s ease;
        }

        .sim-action:hover:not(:disabled) {
          transform: translateY(-1px);
          border-color: rgba(137,164,255,0.34);
        }

        .sim-action.primary {
          background: linear-gradient(180deg, rgba(86,121,255,0.98), rgba(63,88,201,0.98));
          box-shadow: 0 14px 34px rgba(55,84,194,0.26);
        }

        .sim-action:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .sim-saved-message {
          margin-top: 12px;
          font-size: 16px;
          font-weight: 800;
          color: rgba(147,255,184,0.96);
        }

        .sim-side-card {
          padding: 18px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .sim-side-section {
          padding: 18px;
          border-radius: 22px;
          border: 1px solid rgba(255,255,255,0.06);
          background: rgba(8,13,28,0.6);
        }

        .sim-side-title {
          font-size: 23px;
          font-weight: 900;
          margin-bottom: 14px;
        }

        .sim-final-balls {
          display: flex;
          flex-wrap: wrap;
          gap: 14px;
          align-items: center;
        }

        .sim-final-ball {
          width: 76px;
          aspect-ratio: 1 / 1;
          height: auto;
          font-size: 29px;
          box-shadow: 0 10px 22px rgba(0,0,0,0.26);
          flex: 0 0 76px;
        }

        .sim-count-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 12px;
        }

        .sim-count-item {
          padding: 12px;
          border-radius: 18px;
          background: rgba(18,24,48,0.9);
          border: 1px solid rgba(255,255,255,0.06);
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 10px;
        }

        .sim-count-ball {
          width: 62px;
          aspect-ratio: 1 / 1;
          height: auto;
          font-size: 24px;
          flex: 0 0 62px;
        }

        .sim-count-text {
          font-size: 18px;
          font-weight: 800;
          color: rgba(255,255,255,0.9);
        }

        .sim-top-grid {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 12px;
        }

        .sim-top-item {
          padding: 10px 6px 12px;
          border-radius: 18px;
          background: rgba(19,26,51,0.88);
          border: 1px solid rgba(255,255,255,0.06);
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
        }

        .sim-top-ball {
          width: 54px;
          aspect-ratio: 1 / 1;
          height: auto;
          font-size: 22px;
          flex: 0 0 54px;
        }

        .sim-top-count {
          font-size: 14px;
          font-weight: 800;
          color: rgba(225,232,255,0.82);
        }

        .sim-empty-text {
          font-size: 16px;
          color: rgba(220,228,255,0.72);
        }

        .yellow {
          background: linear-gradient(180deg, #efd45d, #d2aa17);
        }

        .navy {
          background: linear-gradient(180deg, #5ca0ff, #2d61e5);
        }

        .red {
          background: linear-gradient(180deg, #ff7a74, #e54e48);
        }

        .gray {
          background: linear-gradient(180deg, #b6bfcc, #8e97a5);
        }

        .green {
          background: linear-gradient(180deg, #5fe09c, #20b968);
        }

        @media (max-width: 1180px) {
          .sim-main-grid {
            grid-template-columns: 1fr;
          }

          .sim-top-grid {
            grid-template-columns: repeat(5, 1fr);
          }
        }

        @media (max-width: 860px) {
          .sim-hero {
            flex-direction: column;
          }

          .sim-action-row {
            grid-template-columns: 1fr;
          }

          .sim-count-grid {
            grid-template-columns: repeat(2, 1fr);
          }

          .sim-top-grid {
            grid-template-columns: repeat(4, 1fr);
          }

          .sim-glass {
            min-height: 300px;
          }

          .sim-rolling-core {
            width: 126px;
          }

          .sim-rolling-core span {
            font-size: 52px;
          }
        }

        @media (max-width: 560px) {
          .sim-page {
            padding: 18px 14px 48px;
          }

          .sim-filter-row {
            gap: 8px;
          }

          .sim-chip,
          .sim-year-select {
            height: 44px;
            font-size: 14px;
          }

          .sim-machine-title,
          .sim-side-title,
          .sim-filter-title {
            font-size: 20px;
          }

          .sim-desc {
            font-size: 15px;
          }

          .sim-top-grid {
            grid-template-columns: repeat(3, 1fr);
          }

          .sim-count-grid {
            grid-template-columns: 1fr 1fr;
          }

          .sim-final-ball {
            width: 62px;
            aspect-ratio: 1 / 1;
            height: auto;
            font-size: 24px;
            flex: 0 0 62px;
          }

          .sim-result-slot {
            width: 60px;
            aspect-ratio: 1 / 1;
            height: auto;
            font-size: 24px;
            flex: 0 0 60px;
          }
        }
      `}</style>
    </div>
  );
}