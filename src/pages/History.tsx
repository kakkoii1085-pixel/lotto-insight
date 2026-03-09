<<<<<<< HEAD
import { useEffect, useState } from "react";

type DrawRow = {
  draw: number;
  numbers: number[];
  bonus: number | null;
};

function parseDraws(csvText: string): DrawRow[] {
  const lines = csvText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const rows: DrawRow[] = [];

  for (const line of lines) {
    const cols = line.split(",").map((v) => v.trim());

    const drawCandidate = Number(cols[0]);
    const nums = cols
      .map((v) => Number(v))
      .filter((v) => !Number.isNaN(v) && v >= 1 && v <= 45);

    if (nums.length >= 6) {
      rows.push({
        draw: Number.isNaN(drawCandidate) ? 0 : drawCandidate,
        numbers: nums.slice(0, 6).sort((a, b) => a - b),
        bonus: nums.length >= 7 ? nums[6] : null,
      });
    }
  }

  return rows
    .filter((row) => row.numbers.length === 6)
    .sort((a, b) => b.draw - a.draw);
}

function ballClass(num: number) {
  if (num <= 10) return "ball yellow";
  if (num <= 20) return "ball blue";
  if (num <= 30) return "ball red";
  if (num <= 40) return "ball gray";
  return "ball green";
}

export default function History() {
  const [draws, setDraws] = useState<DrawRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/lotto_1_1213_numbers.csv")
      .then((res) => res.text())
      .then((csvText) => {
        setDraws(parseDraws(csvText).slice(0, 30));
        setLoading(false);
      })
      .catch(() => {
        setDraws([]);
        setLoading(false);
      });
  }, []);

  return (
    <div className="container">
      <div className="card">
        <h1 className="page-title">역대 당첨번호</h1>
        <p className="page-desc">최근 30개 회차 기준으로 표시합니다.</p>

        {loading && <p className="empty-text">불러오는 중...</p>}

        {!loading && draws.length === 0 && (
          <p className="empty-text">데이터를 불러오지 못했습니다.</p>
        )}

        {!loading && draws.length > 0 && (
          <div className="result-table-wrap">
            <table className="result-table">
              <thead>
                <tr>
                  <th>회차</th>
                  <th>당첨번호</th>
                  <th>보너스</th>
                </tr>
              </thead>
              <tbody>
                {draws.map((row) => (
                  <tr key={`${row.draw}-${row.numbers.join("-")}`}>
                    <td>{row.draw}회</td>
                    <td>
                      <div className="ball-row">
                        {row.numbers.map((num) => (
                          <span key={num} className={ballClass(num)}>
                            {num}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td>
                      {row.bonus ? (
                        <span className={ballClass(row.bonus)}>{row.bonus}</span>
                      ) : (
                        "-"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
=======
import { useEffect, useMemo, useState } from "react";
import { loadHistory, type LottoDraw } from "../data/history";

function getBallClass(n: number) {
  if (n <= 10) return "ball yellow";
  if (n <= 20) return "ball navy";
  if (n <= 30) return "ball red";
  if (n <= 40) return "ball gray";
  return "ball green";
}

function History() {
  const [draws, setDraws] = useState<LottoDraw[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function fetchHistory() {
      try {
        setLoading(true);
        setError("");
        const data = await loadHistory();
        setDraws(data);
      } catch (err) {
        console.error(err);
        setError("로또 데이터를 불러오지 못했습니다.");
      } finally {
        setLoading(false);
      }
    }

    fetchHistory();
  }, []);

  const latestFirstDraws = useMemo(() => {
    return [...draws].sort((a, b) => b.round - a.round);
  }, [draws]);

  if (loading) {
    return <div className="statusText">로또 데이터를 불러오는 중...</div>;
  }

  if (error) {
    return <div className="statusText">{error}</div>;
  }

  return (
    <div className="pageWrap">
      <div className="pageInner">
        <h2 className="pageTitle">역대 당첨번호</h2>

        <div className="pageMeta">
          <span>정렬: 최신회차 → 과거회차</span>
          <span>에러: 없음</span>
          <span>불러온 회차 수: {draws.length}</span>
        </div>

        <div className="tableWrap">
          <table className="resultTable historyTable">
            <thead>
              <tr>
                <th>회차</th>
                <th>추첨일</th>
                <th>번호</th>
                <th>보너스</th>
              </tr>
            </thead>
            <tbody>
              {latestFirstDraws.map((draw) => (
                <tr key={draw.round}>
                  <td>{draw.round}</td>
                  <td>{draw.date}</td>
                  <td>
                    <div className="balls">
                      {draw.numbers.map((num, idx) => (
                        <span
                          key={`${draw.round}-${idx}`}
                          className={getBallClass(num)}
                        >
                          {num}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td>
                    <span className={getBallClass(draw.bonus)}>{draw.bonus}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default History;
>>>>>>> 54a9a93b722b6dc5ac496a8cb897298b7a2890bb
