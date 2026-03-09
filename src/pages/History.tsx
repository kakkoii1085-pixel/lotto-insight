import { useEffect, useState } from "react";

type LottoRow = {
  round: number;
  date: string;
  numbers: number[];
  bonus: number;
};

function getBallClass(num: number) {
  if (num <= 10) return "ball yellow";
  if (num <= 20) return "ball navy";
  if (num <= 30) return "ball red";
  if (num <= 40) return "ball gray";
  return "ball green";
}

export default function History() {
  const [rows, setRows] = useState<LottoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/lotto_numbers.csv")
      .then((res) => {
        if (!res.ok) {
          throw new Error(`파일 요청 실패: ${res.status}`);
        }
        return res.text();
      })
      .then((csvText) => {
        const lines = csvText
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean);

        if (lines.length <= 1) {
          throw new Error("CSV 데이터가 비어 있습니다.");
        }

        const parsed: LottoRow[] = lines
          .slice(1)
          .map((line) => {
            const cols = line.split(",");

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
            };
          })
          .filter(
            (row) =>
              row.round &&
              row.date &&
              row.numbers.length === 6 &&
              row.numbers.every((n) => !Number.isNaN(n)) &&
              !Number.isNaN(row.bonus)
          )
          .sort((a, b) => b.round - a.round)
          .slice(0, 30);

        setRows(parsed);
      })
      .catch((err) => {
        console.error(err);
        setError("데이터를 불러오지 못했습니다.");
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  return (
    <div className="page-container">
      <div className="content-card">
        <h1>역대 당첨번호</h1>
        <p>최근 30개 회차 기준으로 표시합니다.</p>

        {loading && <p>불러오는 중...</p>}
        {error && <p>{error}</p>}

        {!loading && !error && (
          <div className="history-list">
            {rows.map((row) => (
              <div key={row.round} className="history-row">
                <div className="history-header">
                  <strong>{row.round}회</strong> <span>{row.date}</span>
                </div>

                <div className="ball-row">
                  {row.numbers.map((num, idx) => (
                    <span key={idx} className={getBallClass(num)}>
                      {num}
                    </span>
                  ))}
                  <span className="bonus-plus">+</span>
                  <span className={getBallClass(row.bonus)}>{row.bonus}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}