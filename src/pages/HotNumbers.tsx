import { useEffect, useState } from "react";

type NumberCount = {
  num: number;
  count: number;
};

function getBallClass(num: number) {
  if (num <= 10) return "ball yellow";
  if (num <= 20) return "ball navy";
  if (num <= 30) return "ball red";
  if (num <= 40) return "ball gray";
  return "ball green";
}

export default function HotNumbers() {
  const [topNumbers, setTopNumbers] = useState<NumberCount[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/lotto_numbers.csv")
      .then((res) => res.text())
      .then((csvText) => {
        const lines = csvText
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean);

        const counts: Record<number, number> = {};

        for (let i = 1; i <= 45; i++) {
          counts[i] = 0;
        }

        lines.forEach((line) => {
          const nums = line
            .split(",")
            .map((v) => Number(v.trim()))
            .filter((v) => !Number.isNaN(v) && v >= 1 && v <= 45);

          nums.slice(0, 6).forEach((n) => {
            counts[n] += 1;
          });
        });

        const sorted = Object.entries(counts)
          .map(([num, count]) => ({
            num: Number(num),
            count,
          }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 20);

        setTopNumbers(sorted);
        setLoading(false);
      })
      .catch(() => {
        setTopNumbers([]);
        setLoading(false);
      });
  }, []);

  return (
    <div className="container">
      <div className="card">
        <h1 className="page-title">자주 나온 번호 TOP 20</h1>
        <p className="page-desc">역대 당첨 데이터 기준 출현 빈도가 높은 번호입니다.</p>

        {loading && <p className="empty-text">불러오는 중...</p>}

        {!loading && topNumbers.length > 0 && (
          <table className="hot-table">
            <thead>
              <tr>
                <th>순위</th>
                <th>번호</th>
                <th>출현 횟수</th>
              </tr>
            </thead>
            <tbody>
              {topNumbers.map((item, idx) => (
                <tr key={item.num}>
                  <td>
                    <span className="rank-badge">{idx + 1}</span>
                  </td>
                  <td>
                    <span className={getBallClass(item.num)}>{item.num}</span>
                  </td>
                  <td>{item.count}회</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {!loading && topNumbers.length === 0 && (
          <p className="empty-text">데이터를 불러오지 못했습니다.</p>
        )}
      </div>
    </div>
  );
}