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