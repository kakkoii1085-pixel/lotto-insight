import { useEffect, useMemo, useRef, useState } from "react";

type LottoRow = {
  round: number;
  date: string;
  nums: number[];
  bonus: number;
};

type PrizeRow = {
  rank: string;
  amount: number;
  winners: number;
};

type DetailMap = Record<
  string,
  {
    round: number;
    prizes: PrizeRow[];
  }
>;

function getBallClass(num: number) {
  if (num <= 10) return "ball yellow";
  if (num <= 20) return "ball navy";
  if (num <= 30) return "ball red";
  if (num <= 40) return "ball gray";
  return "ball green";
}

function formatMoney(value: number) {
  return `${value.toLocaleString("ko-KR")}원`;
}

// prize 데이터가 있는지 확인 (1등 당첨자수 > 0)
function hasValidPrize(detail: DetailMap[string] | undefined): boolean {
  if (!detail?.prizes?.length) return false;
  return detail.prizes.some((p) => p.rank === "1등" && p.winners > 0);
}

const LS_KEY = "lottoDetails_v1";

function saveDetailsToStorage(data: DetailMap) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(data)); } catch {
    // ignore storage write errors
  }
}

function loadDetailsFromStorage(): DetailMap {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw) as DetailMap;
  } catch {
    // ignore storage read errors
  }
  return {};
}

// CSV 텍스트에서 DetailMap 파싱 (회차,1등당첨자,1등당첨금 열 탐색)
function parsePrizeCsv(text: string): { map: DetailMap; count: number; error?: string } {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return { map: {}, count: 0, error: "데이터가 없습니다." };

  const header = lines[0].split(",").map(h => h.replace(/^\uFEFF/, "").trim());

  const roundIdx = header.findIndex(h => h === "회차");
  const winnersIdx = header.findIndex(h => h.includes("당첨자") || h.includes("1등인원") || h.includes("winners"));
  const amountIdx = header.findIndex(h => h.includes("1게임당") || h.includes("인당") || h.includes("당첨금") || h.includes("금액") || h.includes("amount"));

  if (roundIdx < 0) return { map: {}, count: 0, error: "\"회차\" 열을 찾을 수 없습니다." };
  if (winnersIdx < 0) return { map: {}, count: 0, error: "당첨자 수 열을 찾을 수 없습니다. (\"1등당첨자\", \"당첨자\" 등 포함)" };
  if (amountIdx < 0) return { map: {}, count: 0, error: "당첨금액 열을 찾을 수 없습니다. (\"1등당첨금\", \"당첨금액\" 등 포함)" };

  const map: DetailMap = {};
  let count = 0;

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    const round = parseInt(cols[roundIdx]);
    const winners = parseInt(cols[winnersIdx]?.replace(/[^0-9]/g, "") ?? "0");
    const amount = parseInt(cols[amountIdx]?.replace(/[^0-9]/g, "") ?? "0");
    if (!Number.isFinite(round)) continue;
    map[String(round)] = { round, prizes: [{ rank: "1등", amount, winners }] };
    if (winners > 0) count++;
  }

  return { map, count };
}

export default function History() {
  const [rows, setRows] = useState<LottoRow[]>([]);
  const [details, setDetails] = useState<DetailMap>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sortDesc, setSortDesc] = useState(true);
  const [searchRound, setSearchRound] = useState("");
  const [selectedRound, setSelectedRound] = useState<number | null>(null);
  const [prizeLoading, setPrizeLoading] = useState(false);
  const [prizeFailed,  setPrizeFailed]  = useState(false);
  const [uploadMsg, setUploadMsg] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 선택된 회차의 prize 없으면 자동 fetch (Vercel 프록시 → dhlottery 직접 순서로 시도)
  useEffect(() => {
    if (selectedRound == null) return;
    const key = String(selectedRound);
    if (hasValidPrize(details[key])) { setPrizeFailed(false); return; }

    let cancelled = false;
    setPrizeLoading(true);
    setPrizeFailed(false);

    async function fetchPrize() {
      // 1차 시도: Vercel 서버리스 프록시 (5초 타임아웃)
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 5000);
        const r = await fetch(`/api/prize?round=${selectedRound}`, { signal: ctrl.signal });
        clearTimeout(t);
        if (r.ok) {
          const data = await r.json();
          if (!cancelled && data?.prizes?.length &&
              data.prizes.some((p: {rank:string;winners:number}) => p.winners > 0)) {
            setDetails((prev) => ({ ...prev, [key]: data }));
            setPrizeLoading(false);
            return;
          }
        }
      } catch {
        /* 실패 시 2차 시도 */
      }

      // 2차 시도: dhlottery API 직접 호출 (3초 타임아웃)
      try {
        const ctrl2 = new AbortController();
        const t2 = setTimeout(() => ctrl2.abort(), 3000);
        const r2 = await fetch(
          `https://www.dhlottery.co.kr/common.do?method=getLottoNumber&drwNo=${selectedRound}`,
          { headers: { 'Accept': 'application/json' }, signal: ctrl2.signal }
        );
        clearTimeout(t2);
        if (r2.ok) {
          const d = await r2.json();
          if (!cancelled && d?.returnValue === 'success') {
            const parsed = {
              round: selectedRound,
              prizes: [{
                rank: '1등',
                amount: parseInt(String(d.firstWinamnt ?? '0'), 10),
                winners: parseInt(String(d.firstPrzwnerCo ?? '0'), 10),
              }],
            };
            if (parsed.prizes[0].winners > 0) {
              setDetails((prev) => ({ ...prev, [key]: parsed }));
              if (!cancelled) { setPrizeLoading(false); return; }
            }
          }
        }
      } catch {
        /* CORS 차단 등 무시 */
      }

      if (!cancelled) { setPrizeLoading(false); setPrizeFailed(true); }
    }

    fetchPrize();
    return () => { cancelled = true; };
  }, [details, selectedRound]);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        setError("");

        const csvRes = await fetch("/lotto_numbers.csv");
        let detailRes: Response | null = null;
        try {
          detailRes = await fetch("/lotto_history_details.json");
        } catch {
          detailRes = null;
        }

        const csvText = await csvRes.text();

        let detailJson: DetailMap = {};
        try {
          if (detailRes && detailRes.ok) {
            detailJson = await detailRes.json();
          }
        } catch {
          detailJson = {};
        }

        const lines = csvText
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean);

        const parsed: LottoRow[] = [];

        for (let i = 1; i < lines.length; i += 1) {
          const cols = lines[i].split(",");

          if (cols.length < 10) continue;

          const round = Number(cols[1]);
          const date = cols[2];
          const nums = cols.slice(3, 9).map((v) => Number(v));
          const bonus = Number(cols[9]);

          if (
            !Number.isFinite(round) ||
            nums.some((n) => !Number.isFinite(n)) ||
            !Number.isFinite(bonus)
          ) {
            continue;
          }

          parsed.push({
            round,
            date,
            nums,
            bonus,
          });
        }

        parsed.sort((a, b) => b.round - a.round);

        setRows(parsed);

        // localStorage 데이터 우선 적용 (업로드로 저장한 당첨 정보)
        const stored = loadDetailsFromStorage();
        const storedValid = Object.values(stored).filter(v => hasValidPrize(v)).length;
        const jsonValid   = Object.values(detailJson).filter(v => hasValidPrize(v)).length;
        const merged = storedValid >= jsonValid ? { ...detailJson, ...stored } : { ...stored, ...detailJson };
        setDetails(merged);

        if (parsed.length > 0) {
          setSelectedRound(parsed[0].round);
        }
      } catch (e) {
        console.error(e);
        setError("역대 당첨번호 데이터를 불러오지 못했습니다.");
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  // CSV 파일 업로드 핸들러
  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      const { map, count, error: parseErr } = parsePrizeCsv(text);
      if (parseErr) { setUploadMsg(`❌ ${parseErr}`); return; }
      if (count === 0) { setUploadMsg("❌ 유효한 당첨 데이터가 없습니다. 헤더를 확인하세요."); return; }

      setDetails(prev => {
        const merged = { ...prev };
        for (const [k, v] of Object.entries(map)) {
          if (hasValidPrize(v)) merged[k] = v;
        }
        saveDetailsToStorage(merged);
        return merged;
      });
      setUploadMsg(`✅ ${count}개 회차 당첨 정보 업데이트 완료!`);
      setTimeout(() => setUploadMsg(""), 4000);
    };
    reader.onerror = () => setUploadMsg("❌ 파일을 읽을 수 없습니다.");
    reader.readAsText(file, "utf-8");
  }

  const filteredRows = useMemo(() => {
    let result = [...rows];

    if (searchRound.trim()) {
      result = result.filter((row) =>
        String(row.round).includes(searchRound.trim())
      );
    }

    result.sort((a, b) => (sortDesc ? b.round - a.round : a.round - b.round));
    return result;
  }, [rows, searchRound, sortDesc]);

  const selectedRow = useMemo(() => {
    if (selectedRound == null) return filteredRows[0] ?? null;
    return rows.find((row) => row.round === selectedRound) ?? filteredRows[0] ?? null;
  }, [rows, filteredRows, selectedRound]);

  const selectedDetail = useMemo(() => {
    if (!selectedRow) return null;
    return details[String(selectedRow.round)] ?? null;
  }, [details, selectedRow]);

  if (loading) {
    return (
      <div className="history-page">
        <div className="history-loading">역대 당첨번호 불러오는 중...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="history-page">
        <div className="history-error">{error}</div>
      </div>
    );
  }

  return (
    <div className="history-page">
      <section className="history-header-card">
        <div>
          <p className="history-eyebrow">LOTTO HISTORY</p>
          <h2 className="history-title">역대 당첨번호</h2>
          <p className="history-subtitle">
            회차별 당첨번호와 순위별 당첨자 수, 당첨금액을 한 번에 확인할 수 있습니다.
          </p>
        </div>

        <div className="history-toolbar">
          <input
            className="history-search"
            type="text"
            value={searchRound}
            onChange={(e) => setSearchRound(e.target.value)}
            placeholder="회차 검색 (예: 1215)"
          />

          <button
            className="history-sort-btn"
            type="button"
            onClick={() => setSortDesc((prev) => !prev)}
          >
            {sortDesc ? "최신순" : "과거순"}
          </button>

          {/* 숨김 파일 인풋 */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            style={{ display: "none" }}
            onChange={handleFileUpload}
          />
          <button
            className="history-sort-btn"
            type="button"
            title="당첨 데이터가 담긴 CSV 파일을 업로드하여 당첨자/당첨금 정보를 갱신합니다"
            onClick={() => fileInputRef.current?.click()}
          >
            📂 데이터 업데이트
          </button>
          {uploadMsg && (
            <span style={{ fontSize: 12, color: uploadMsg.startsWith("✅") ? "#4ade80" : "#f87171", marginLeft: 8 }}>
              {uploadMsg}
            </span>
          )}
        </div>
      </section>

      <section className="history-layout">
        <div className="history-list-card">
          <div className="history-list-head">
            <span className="col-round">회차</span>
            <span className="col-date">추첨일</span>
            <span className="col-numbers">당첨번호</span>
            <span className="col-bonus">보너스</span>
          </div>

          <div className="history-list-body">
            {filteredRows.map((row) => {
              const isActive = selectedRow?.round === row.round;

              return (
                <button
                  key={row.round}
                  type="button"
                  className={`history-row ${isActive ? "active" : ""}`}
                  onClick={() => setSelectedRound(row.round)}
                >
                  <span className="col-round">{row.round}</span>
                  <span className="col-date">{row.date}</span>

                  <span className="col-numbers history-balls">
                    {row.nums.map((num) => (
                      <span key={num} className={getBallClass(num)}>
                        {num}
                      </span>
                    ))}
                  </span>

                  <span className="col-bonus history-bonus-wrap">
                    <span className={getBallClass(row.bonus)}>{row.bonus}</span>
                  </span>
                </button>
              );
            })}

            {filteredRows.length === 0 && (
              <div className="history-empty">검색된 회차가 없습니다.</div>
            )}
          </div>
        </div>

        <div className="history-detail-card">
          {selectedRow ? (
            <>
              <div className="history-detail-top">
                <div>
                  <p className="history-detail-label">선택 회차</p>
                  <h3 className="history-detail-round">{selectedRow.round}회</h3>
                  <p className="history-detail-date">{selectedRow.date} 추첨</p>
                </div>
              </div>

              <div className="history-detail-section">
                <div className="history-detail-section-title">당첨번호</div>
                <div className="history-detail-balls">
                  {selectedRow.nums.map((num) => (
                    <span key={num} className={getBallClass(num)}>
                      {num}
                    </span>
                  ))}
                  <span className="history-plus">+</span>
                  <span className={getBallClass(selectedRow.bonus)}>
                    {selectedRow.bonus}
                  </span>
                </div>
              </div>

              <div className="history-detail-section">
                <div className="history-detail-section-title">
                  1등 당첨자 / 당첨금액
                </div>

                {prizeLoading ? (
                  <div className="history-prize-loading">불러오는 중...</div>
                ) : hasValidPrize(selectedDetail ?? undefined) ? (
                  <div className="history-prize-table">
                    <div className="history-prize-head">
                      <span>순위</span>
                      <span>당첨자 수</span>
                      <span>1인당 당첨금</span>
                    </div>

                    {selectedDetail!.prizes.map((prize) => (
                      <div className="history-prize-row" key={prize.rank}>
                        <span className="history-prize-rank">{prize.rank}</span>
                        <span>{prize.winners.toLocaleString("ko-KR")}명</span>
                        <span>
                          {formatMoney(prize.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : prizeFailed ? (
                  <div className="history-no-detail">
                    <span className="history-no-detail-icon">📋</span>
                    당첨 정보를 가져올 수 없습니다
                    <button
                      className="subBtn"
                      style={{marginLeft:10,fontSize:11,padding:'2px 8px'}}
                      onClick={() => { setPrizeFailed(false); setPrizeLoading(false); }}
                    >재시도</button>
                  </div>
                ) : (
                  <div className="history-no-detail">
                    <span className="history-no-detail-icon">📋</span>
                    당첨 정보 없음
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="history-empty">선택된 회차가 없습니다.</div>
          )}
        </div>
      </section>
    </div>
  );
}
