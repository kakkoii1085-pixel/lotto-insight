import { useEffect, useMemo, useState } from "react";
import { loadHistory, type LottoDraw } from "../data/history";

type CountItem = {
  number: number;
  count: number;
};

function getBallClass(n: number) {
  if (n <= 10) return "ball yellow";
  if (n <= 20) return "ball navy";
  if (n <= 30) return "ball red";
  if (n <= 40) return "ball gray";
  return "ball green";
}

function calcStdDev(numbers: number[]) {
  const mean = numbers.reduce((a, b) => a + b, 0) / numbers.length;
  const variance =
    numbers.reduce((acc, cur) => acc + (cur - mean) ** 2, 0) / numbers.length;
  return Math.sqrt(variance);
}

function Analysis() {
  const [draws, setDraws] = useState<LottoDraw[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rangeMode, setRangeMode] = useState<"all" | 10 | 30 | 100>("all");
  const [sortMode, setSortMode] = useState<"number" | "count">("number");

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        setError("");
        const data = await loadHistory();
        setDraws(data);
      } catch (err) {
        console.error(err);
        setError("분석 데이터를 불러오지 못했습니다.");
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  const filteredDraws = useMemo(() => {
    if (rangeMode === "all") return draws;
    return draws.slice(-rangeMode);
  }, [draws, rangeMode]);

  const stats = useMemo(() => {
    if (filteredDraws.length === 0) {
      return {
        count: 0,
        avgSum: 0,
        avgStdDev: 0,
        top10: [] as CountItem[],
        bottom10: [] as CountItem[],
        frequencyList: [] as CountItem[],
      };
    }

    const sums = filteredDraws.map((draw) =>
      draw.numbers.reduce((acc, cur) => acc + cur, 0)
    );
    const stds = filteredDraws.map((draw) => calcStdDev(draw.numbers));

    const avgSum = sums.reduce((acc, cur) => acc + cur, 0) / sums.length;
    const avgStdDev = stds.reduce((acc, cur) => acc + cur, 0) / stds.length;

    const freqMap = new Map<number, number>();
    for (let i = 1; i <= 45; i += 1) {
      freqMap.set(i, 0);
    }

    for (const draw of filteredDraws) {
      for (const num of draw.numbers) {
        freqMap.set(num, (freqMap.get(num) || 0) + 1);
      }
    }

    const byCount = Array.from(freqMap.entries())
      .map(([number, count]) => ({ number, count }))
      .sort((a, b) => b.count - a.count || a.number - b.number);

    const top10 = byCount.slice(0, 10);
    const bottom10 = [...byCount]
      .sort((a, b) => a.count - b.count || a.number - b.number)
      .slice(0, 10);

    const frequencyList =
      sortMode === "number"
        ? Array.from(freqMap.entries())
            .map(([number, count]) => ({ number, count }))
            .sort((a, b) => a.number - b.number)
        : Array.from(freqMap.entries())
            .map(([number, count]) => ({ number, count }))
            .sort((a, b) => b.count - a.count || a.number - b.number);

    return {
      count: filteredDraws.length,
      avgSum,
      avgStdDev,
      top10,
      bottom10,
      frequencyList,
    };
  }, [filteredDraws, sortMode]);

  const maxCount = useMemo(() => {
    if (stats.frequencyList.length === 0) return 1;
    return Math.max(...stats.frequencyList.map((item) => item.count), 1);
  }, [stats.frequencyList]);

  if (loading) {
    return <div className="statusText">분석 데이터 불러오는 중...</div>;
  }

  if (error) {
    return <div className="statusText">{error}</div>;
  }

  return (
    <div className="pageWrap">
      <div className="pageInner">
        <div className="analysisHeader">
          <h2 className="pageTitle">분석</h2>

          <div className="toggleGroup">
            <button
              className={`toggleBtn ${rangeMode === "all" ? "active" : ""}`}
              onClick={() => setRangeMode("all")}
            >
              전체
            </button>
            <button
              className={`toggleBtn ${rangeMode === 10 ? "active" : ""}`}
              onClick={() => setRangeMode(10)}
            >
              최근 10
            </button>
            <button
              className={`toggleBtn ${rangeMode === 30 ? "active" : ""}`}
              onClick={() => setRangeMode(30)}
            >
              최근 30
            </button>
            <button
              className={`toggleBtn ${rangeMode === 100 ? "active" : ""}`}
              onClick={() => setRangeMode(100)}
            >
              최근 100
            </button>
          </div>
        </div>

        <div className="cardGrid">
          <div className="infoCard">
            <div className="cardLabel">회차 수</div>
            <div className="cardValue">{stats.count}</div>
          </div>

          <div className="infoCard">
            <div className="cardLabel">평균 합계</div>
            <div className="cardValue">{stats.avgSum.toFixed(1)}</div>
          </div>

          <div className="infoCard">
            <div className="cardLabel">평균 표준편차</div>
            <div className="cardValue">{stats.avgStdDev.toFixed(2)}</div>
          </div>
        </div>

        <div className="analysisTwoCol">
          <section className="panel">
            <div className="panelHeader">
              <h3 className="panelTitle">TOP 10</h3>
              <span className="panelSubText">선택 구간 기준</span>
            </div>

            <div className="chipWrap">
              {stats.top10.map((item) => (
                <div className="countChip" key={`top-${item.number}`}>
                  <span className={getBallClass(item.number)}>{item.number}</span>
                  <span className="countText">{item.count}회</span>
                </div>
              ))}
            </div>
          </section>

          <section className="panel">
            <div className="panelHeader">
              <h3 className="panelTitle">BOTTOM 10</h3>
              <span className="panelSubText">선택 구간 기준</span>
            </div>

            <div className="chipWrap">
              {stats.bottom10.map((item) => (
                <div className="countChip" key={`bottom-${item.number}`}>
                  <span className={getBallClass(item.number)}>{item.number}</span>
                  <span className="countText">{item.count}회</span>
                </div>
              ))}
            </div>
          </section>
        </div>

        <section className="panel">
          <div className="panelHeader">
            <div>
              <h3 className="panelTitle">1~45 전체 빈도</h3>
              <p className="panelHint">막대는 최대 출현 빈도 기준 비율</p>
            </div>

            <div className="toggleGroup">
              <button
                className={`toggleBtn ${sortMode === "number" ? "active" : ""}`}
                onClick={() => setSortMode("number")}
              >
                번호순
              </button>
              <button
                className={`toggleBtn ${sortMode === "count" ? "active" : ""}`}
                onClick={() => setSortMode("count")}
              >
                출현순
              </button>
            </div>
          </div>

          <div className="barList">
            {stats.frequencyList.map((item) => (
              <div className="barRow" key={`bar-${item.number}`}>
                <div className="barBall">
                  <span className={getBallClass(item.number)}>{item.number}</span>
                </div>

                <div className="barTrack">
                  <div
                    className="barFill"
                    style={{
                      width: `${(item.count / maxCount) * 100}%`,
                    }}
                  />
                </div>

                <div className="barCount">{item.count}회</div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

export default Analysis;