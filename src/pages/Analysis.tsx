import { useEffect, useMemo, useState } from "react";

type LottoRow = {
  round: number;
  date: string;
  numbers: number[];
  bonus: number;
};

type RangeType = "10" | "30" | "50" | "all";

type CompanionStat = {
  num: number;
  count: number;
  latestRound: number;
  latestDate: string;
};

type ComboStat = {
  nums: number[];
  count: number;
  latestRound: number;
  latestDate: string;
};

function getAnalysisBallClass(num: number) {
  if (num <= 10) return "analysis-ball yellow";
  if (num <= 20) return "analysis-ball navy";
  if (num <= 30) return "analysis-ball red";
  if (num <= 40) return "analysis-ball gray";
  return "analysis-ball green";
}

function sliceRowsByRange(rows: LottoRow[], range: RangeType) {
  if (range === "10") return rows.slice(0, 10);
  if (range === "30") return rows.slice(0, 30);
  if (range === "50") return rows.slice(0, 50);
  return rows;
}

function getCombinations(nums: number[], size: number): number[][] {
  const result: number[][] = [];

  function backtrack(start: number, path: number[]) {
    if (path.length === size) {
      result.push([...path]);
      return;
    }

    for (let i = start; i < nums.length; i += 1) {
      path.push(nums[i]);
      backtrack(i + 1, path);
      path.pop();
    }
  }

  backtrack(0, []);
  return result;
}

export default function Analysis() {
  const [rows, setRows] = useState<LottoRow[]>([]);
  const [summaryRange, setSummaryRange] = useState<RangeType>("all");
  const [frequencyRange, setFrequencyRange] = useState<RangeType>("all");
  const [frequencyYear, setFrequencyYear] = useState<string>("all");
  const [selectedNumber, setSelectedNumber] = useState<number | null>(null);

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
            if (cols.length < 10) return null;

            return {
              round: Number(cols[1]),
              date: cols[2],
              numbers: [
                Number(cols[3]),
                Number(cols[4]),
                Number(cols[5]),
                Number(cols[6]),
                Number(cols[7]),
                Number(cols[8]),
              ],
              bonus: Number(cols[9]),
            } as LottoRow;
          })
          .filter(Boolean) as LottoRow[];

        setRows(parsed.sort((a, b) => b.round - a.round));
      })
      .catch(() => {
        setRows([]);
      });
  }, []);

  const yearOptions = useMemo(() => {
    const years = Array.from(new Set(rows.map((row) => row.date.slice(0, 4))))
      .filter(Boolean)
      .sort((a, b) => Number(b) - Number(a));

    return ["all", ...years];
  }, [rows]);

  const summaryRows = useMemo(
    () => sliceRowsByRange(rows, summaryRange),
    [rows, summaryRange]
  );

  const yearFilteredFrequencyRows = useMemo(() => {
    if (frequencyYear === "all") return rows;
    return rows.filter((row) => row.date.startsWith(frequencyYear));
  }, [rows, frequencyYear]);

  const frequencyRows = useMemo(
    () => sliceRowsByRange(yearFilteredFrequencyRows, frequencyRange),
    [yearFilteredFrequencyRows, frequencyRange]
  );

  const sums = useMemo(() => {
    return summaryRows.map((row) =>
      row.numbers.reduce((acc, cur) => acc + cur, 0)
    );
  }, [summaryRows]);

  const minSum = sums.length ? Math.min(...sums) : 0;
  const maxSum = sums.length ? Math.max(...sums) : 0;
  const avgSum = sums.length
    ? Math.round(sums.reduce((a, b) => a + b, 0) / sums.length)
    : 0;

  const last7Points = useMemo(() => sums.slice(0, 7), [sums]);

  const getPosition = (value: number) => {
    if (maxSum === minSum) return 50;
    return ((value - minSum) / (maxSum - minSum)) * 100;
  };

  const frequency = useMemo(() => {
    const map: Record<number, number> = {};
    for (let i = 1; i <= 45; i += 1) map[i] = 0;

    frequencyRows.forEach((row) => {
      row.numbers.forEach((num) => {
        map[num] += 1;
      });
    });

    return map;
  }, [frequencyRows]);

  const sortedNumbersByFrequency = useMemo(() => {
    return Array.from({ length: 45 }, (_, i) => i + 1).sort((a, b) => {
      const diff = frequency[b] - frequency[a];
      if (diff !== 0) return diff;
      return a - b;
    });
  }, [frequency]);

  const selectedAppearances = useMemo(() => {
    if (!selectedNumber) return [];

    return frequencyRows
      .filter((row) => row.numbers.includes(selectedNumber))
      .map((row) => ({
        round: row.round,
        date: row.date,
        numbers: row.numbers,
        bonus: row.bonus,
      }));
  }, [frequencyRows, selectedNumber]);

  const companionNumbers = useMemo<CompanionStat[]>(() => {
    if (!selectedNumber) return [];

    const countMap: Record<
      number,
      { count: number; latestRound: number; latestDate: string }
    > = {};

    selectedAppearances.forEach((item) => {
      item.numbers.forEach((num) => {
        if (num === selectedNumber) return;

        if (!countMap[num]) {
          countMap[num] = {
            count: 0,
            latestRound: item.round,
            latestDate: item.date,
          };
        }

        countMap[num].count += 1;

        if (item.round > countMap[num].latestRound) {
          countMap[num].latestRound = item.round;
          countMap[num].latestDate = item.date;
        }
      });
    });

    return Object.entries(countMap)
      .map(([num, info]) => ({
        num: Number(num),
        count: info.count,
        latestRound: info.latestRound,
        latestDate: info.latestDate,
      }))
      .filter((item) => item.count >= 2)
      .sort((a, b) => {
        const diff = b.count - a.count;
        if (diff !== 0) return diff;
        return a.num - b.num;
      })
      .slice(0, 6);
  }, [selectedAppearances, selectedNumber]);

  const pairCombos = useMemo<ComboStat[]>(() => {
    if (!selectedNumber) return [];

    const comboMap: Record<
      string,
      { nums: number[]; count: number; latestRound: number; latestDate: string }
    > = {};

    selectedAppearances.forEach((item) => {
      const others = item.numbers
        .filter((num) => num !== selectedNumber)
        .sort((a, b) => a - b);

      const combos = getCombinations(others, 2);

      combos.forEach((combo) => {
        const key = combo.join("-");

        if (!comboMap[key]) {
          comboMap[key] = {
            nums: combo,
            count: 0,
            latestRound: item.round,
            latestDate: item.date,
          };
        }

        comboMap[key].count += 1;

        if (item.round > comboMap[key].latestRound) {
          comboMap[key].latestRound = item.round;
          comboMap[key].latestDate = item.date;
        }
      });
    });

    return Object.values(comboMap)
      .filter((item) => item.count >= 2)
      .sort((a, b) => {
        const diff = b.count - a.count;
        if (diff !== 0) return diff;
        return a.nums.join("-").localeCompare(b.nums.join("-"));
      })
      .slice(0, 6);
  }, [selectedAppearances, selectedNumber]);

  const tripleCombos = useMemo<ComboStat[]>(() => {
    if (!selectedNumber) return [];

    const comboMap: Record<
      string,
      { nums: number[]; count: number; latestRound: number; latestDate: string }
    > = {};

    selectedAppearances.forEach((item) => {
      const others = item.numbers
        .filter((num) => num !== selectedNumber)
        .sort((a, b) => a - b);

      const combos = getCombinations(others, 3);

      combos.forEach((combo) => {
        const key = combo.join("-");

        if (!comboMap[key]) {
          comboMap[key] = {
            nums: combo,
            count: 0,
            latestRound: item.round,
            latestDate: item.date,
          };
        }

        comboMap[key].count += 1;

        if (item.round > comboMap[key].latestRound) {
          comboMap[key].latestRound = item.round;
          comboMap[key].latestDate = item.date;
        }
      });
    });

    return Object.values(comboMap)
      .filter((item) => item.count >= 2)
      .sort((a, b) => {
        const diff = b.count - a.count;
        if (diff !== 0) return diff;
        return a.nums.join("-").localeCompare(b.nums.join("-"));
      })
      .slice(0, 6);
  }, [selectedAppearances, selectedNumber]);

  const latestRound = rows.length ? rows[0].round : 0;
  const summaryBaseRound = summaryRows.length ? summaryRows[0].round : 0;

  return (
    <div className="analysis-page">
      <div className="analysis-top-grid">
        <section className="analysis-dashboard-card analysis-info-card">
          <h2 className="analysis-card-title">분석</h2>

          <p className="analysis-card-subtext">
            선택 범위: 최근 {summaryRange === "all" ? "전체" : summaryRange} /
            기준 회차 {summaryRange === "all" ? latestRound : summaryBaseRound}회
          </p>

          <div className="analysis-range-tabs">
            <button
              className={`analysis-range-tab ${
                summaryRange === "10" ? "active" : ""
              }`}
              onClick={() => setSummaryRange("10")}
            >
              최근 10회
            </button>
            <button
              className={`analysis-range-tab ${
                summaryRange === "30" ? "active" : ""
              }`}
              onClick={() => setSummaryRange("30")}
            >
              최근 30회
            </button>
            <button
              className={`analysis-range-tab ${
                summaryRange === "50" ? "active" : ""
              }`}
              onClick={() => setSummaryRange("50")}
            >
              최근 50회
            </button>
            <button
              className={`analysis-range-tab ${
                summaryRange === "all" ? "active" : ""
              }`}
              onClick={() => setSummaryRange("all")}
            >
              전체
            </button>
          </div>
        </section>

        <section className="analysis-dashboard-card analysis-chart-card">
          <h2 className="analysis-card-title">선택구간 평균합계</h2>

          <div className="analysis-sum-chart-wrap">
            <div className="analysis-chart-badge analysis-min-badge">
              MIN {minSum}
            </div>
            <div className="analysis-chart-badge analysis-avg-badge">
              AVG {avgSum}
            </div>
            <div className="analysis-chart-badge analysis-max-badge">
              MAX {maxSum}
            </div>

            <div className="analysis-chart-line" />
            <div className="analysis-chart-tick analysis-left-tick" />
            <div className="analysis-chart-tick analysis-right-tick" />

            {last7Points.map((value, idx) => {
              const isLatest = idx === 0;
              const left = getPosition(value);
              const labelClass = idx % 2 === 0 ? "up" : "down";

              return (
                <div
                  key={`${value}-${idx}`}
                  className={`analysis-point-wrap ${labelClass} ${
                    isLatest ? "latest" : ""
                  }`}
                  style={{ left: `${left}%` }}
                >
                  <div className="analysis-chart-point" />
                  <div className="analysis-point-value">{value}</div>

                  {isLatest && (
                    <div className="analysis-latest-label">
                      최근값 {value} / {summaryRows[0]?.round ?? ""}회
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <section className="analysis-dashboard-card analysis-freq-section">
        <div className="freqGuideInline">
          <span className="freqGuideIcon">⚡</span>
          <span className="freqGuideLabel">번호 출현빈도</span>
          <span className="freqGuideMessage">
            번호를 클릭하면 해당 번호의 출현 회차와 날짜를 최신순으로 확인할 수
            있습니다.
          </span>
        </div>

        <div className="analysis-freq-header">
          <div className="hot-filter-wrap">
            <div className="hot-filter-row">
              <button
                className={`analysis-mini-filter ${
                  frequencyRange === "10" ? "active" : ""
                }`}
                onClick={() => {
                  setFrequencyRange("10");
                  setSelectedNumber(null);
                }}
              >
                10회
              </button>
              <button
                className={`analysis-mini-filter ${
                  frequencyRange === "30" ? "active" : ""
                }`}
                onClick={() => {
                  setFrequencyRange("30");
                  setSelectedNumber(null);
                }}
              >
                30회
              </button>
              <button
                className={`analysis-mini-filter ${
                  frequencyRange === "50" ? "active" : ""
                }`}
                onClick={() => {
                  setFrequencyRange("50");
                  setSelectedNumber(null);
                }}
              >
                50회
              </button>
              <button
                className={`analysis-mini-filter ${
                  frequencyRange === "all" ? "active" : ""
                }`}
                onClick={() => {
                  setFrequencyRange("all");
                  setSelectedNumber(null);
                }}
              >
                전체
              </button>
            </div>

            <div className="hot-filter-row hot-filter-year-row">
              {yearOptions.map((year) => (
                <button
                  key={year}
                  type="button"
                  className={`hot-filter-btn year-btn ${
                    frequencyYear === year ? "active" : ""
                  }`}
                  onClick={() => {
                    setFrequencyYear(year);
                    setSelectedNumber(null);
                  }}
                >
                  {year === "all" ? "년도전체" : `${year}년`}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="analysis-freq-grid compact">
          {sortedNumbersByFrequency.map((num) => (
            <button
              key={num}
              type="button"
              className={`analysis-freq-card compact ${
                selectedNumber === num ? "selected" : ""
              }`}
              onClick={() =>
                setSelectedNumber((prev) => (prev === num ? null : num))
              }
            >
              <div className={getAnalysisBallClass(num)}>{num}</div>
              <div className="analysis-freq-count">{frequency[num]}회</div>
            </button>
          ))}
        </div>

        {selectedNumber && (
          <div className="analysis-detail-dense">
            <div className="analysis-detail-header">
              <div className="analysis-detail-header-left">
                <span className={getAnalysisBallClass(selectedNumber)}>
                  {selectedNumber}
                </span>
                <div className="analysis-detail-header-text">
                  <strong>{selectedNumber}번 출현 이력</strong>
                  <span>
                    최근 {frequencyRange === "all" ? "전체" : frequencyRange} 기준
                    / {frequencyYear === "all" ? "년도 전체" : `${frequencyYear}년`} /
                    총 {selectedAppearances.length}회
                  </span>
                </div>
              </div>

              <button
                type="button"
                className="analysis-inline-close"
                onClick={() => setSelectedNumber(null)}
              >
                닫기
              </button>
            </div>

            <div className="analysis-detail-summary-grid analysis-detail-summary-grid-fixed">
              <div className="analysis-detail-summary-card analysis-detail-summary-card-companion">
                <span>동반출현</span>
                {companionNumbers.length === 0 ? (
                  <strong>없음</strong>
                ) : (
                  <div className="analysis-dense-companion-list summary-first">
                    {companionNumbers.slice(0, 4).map((item) => (
                      <div
                        key={item.num}
                        className="analysis-dense-companion-item summary-first"
                      >
                        <span className={getAnalysisBallClass(item.num)}>
                          {item.num}
                        </span>
                        <div className="analysis-dense-companion-text">
                          <strong>{item.count}회</strong>
                          <em>
                            최근 {item.latestRound}회 / {item.latestDate}
                          </em>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="analysis-detail-summary-card">
                <span>선택 번호</span>
                <div className="analysis-summary-ball-wrap">
                  <span
                    className={`${getAnalysisBallClass(
                      selectedNumber
                    )} analysis-summary-ball`}
                  >
                    {selectedNumber}
                  </span>
                </div>
              </div>

              <div className="analysis-detail-summary-card">
                <span>출현 횟수</span>
                <strong>{selectedAppearances.length}회</strong>
              </div>

              <div className="analysis-detail-summary-card">
                <span>조회 기준</span>
                <strong>
                  최근 {frequencyRange === "all" ? "전체" : frequencyRange}
                </strong>
                <strong>
                  {frequencyYear === "all" ? "년도 전체" : `${frequencyYear}년`}
                </strong>
              </div>
            </div>

            <div className="analysis-detail-body swapped">
              <aside className="analysis-detail-side left-side">
                <div className="analysis-detail-side-card">
                  <div className="analysis-detail-side-title">동반출현 숫자</div>

                  {companionNumbers.length === 0 ? (
                    <div className="analysis-detail-side-empty">없음</div>
                  ) : (
                    <div className="analysis-detail-side-list">
                      {companionNumbers.map((item) => (
                        <div
                          key={`single-${item.num}`}
                          className="analysis-detail-side-item"
                        >
                          <span className={getAnalysisBallClass(item.num)}>
                            {item.num}
                          </span>
                          <div className="analysis-detail-side-item-text">
                            <strong>{item.count}회</strong>
                            <span>
                              최근 {item.latestRound}회 / {item.latestDate}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="analysis-detail-side-card">
                  <div className="analysis-detail-side-title">2번호 동반조합</div>

                  {pairCombos.length === 0 ? (
                    <div className="analysis-detail-side-empty">없음</div>
                  ) : (
                    <div className="analysis-combo-list">
                      {pairCombos.map((item, idx) => (
                        <div key={`pair-${idx}`} className="analysis-combo-item">
                          <div className="analysis-combo-balls">
                            {item.nums.map((num) => (
                              <span
                                key={`pair-ball-${idx}-${num}`}
                                className={getAnalysisBallClass(num)}
                              >
                                {num}
                              </span>
                            ))}
                          </div>
                          <div className="analysis-combo-text">
                            <strong>{item.count}회</strong>
                            <span>
                              최근 {item.latestRound}회 / {item.latestDate}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="analysis-detail-side-card">
                  <div className="analysis-detail-side-title">3번호 동반조합</div>

                  {tripleCombos.length === 0 ? (
                    <div className="analysis-detail-side-empty">없음</div>
                  ) : (
                    <div className="analysis-combo-list">
                      {tripleCombos.map((item, idx) => (
                        <div
                          key={`triple-${idx}`}
                          className="analysis-combo-item"
                        >
                          <div className="analysis-combo-balls">
                            {item.nums.map((num) => (
                              <span
                                key={`triple-ball-${idx}-${num}`}
                                className={getAnalysisBallClass(num)}
                              >
                                {num}
                              </span>
                            ))}
                          </div>
                          <div className="analysis-combo-text">
                            <strong>{item.count}회</strong>
                            <span>
                              최근 {item.latestRound}회 / {item.latestDate}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </aside>

              <div className="analysis-detail-list right-list">
                {selectedAppearances.length === 0 ? (
                  <div className="analysis-empty-text">출현 이력이 없습니다.</div>
                ) : (
                  selectedAppearances.map((item) => (
                    <div key={item.round} className="analysis-detail-row">
                      <div className="analysis-detail-row-meta">
                        <strong>{item.round}회</strong>
                        <span>{item.date}</span>
                      </div>

                      <div className="analysis-detail-row-balls">
                        {item.numbers.map((n) => (
                          <span
                            key={`${item.round}-${n}`}
                            className={getAnalysisBallClass(n)}
                          >
                            {n}
                          </span>
                        ))}
                        <span className="analysis-bonus-badge">
                          B {item.bonus}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}