import { useEffect, useMemo, useState } from "react";

type SavedNumberItem = {
  id: string;
  numbers: number[];
  bonus?: number | null;
  source?: "generator" | "simulator" | string;
  createdAt?: string;
  modeLabel?: string;
  note?: string;
};

type SourceFilter = "all" | "generator" | "simulator";

type LottoRow = {
  round: number;
  date: string;
  numbers: number[];
  bonus: number;
};

type VirtualRound = {
  round: number;
  date: string;
};

const STORAGE_KEY = "savedNumbers";
const LEGACY_KEYS = [
  "savedLottoSets",
  "saved_numbers",
  "lotto_saved_games",
  "lotto_purchase_numbers",
  "purchase_numbers",
];

function getBallClass(num: number) {
  if (num <= 10) return "ball yellow";
  if (num <= 20) return "ball navy";
  if (num <= 30) return "ball red";
  if (num <= 40) return "ball gray";
  return "ball green";
}

function normalizeNumbers(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const nums = value
    .map((v) => Number(v))
    .filter((n) => Number.isFinite(n) && n >= 1 && n <= 45);

  const unique = Array.from(new Set(nums)).sort((a, b) => a - b);
  return unique.length === 6 ? unique : [];
}

function normalizeSavedItem(
  raw: any,
  fallbackSource?: string
): SavedNumberItem | null {
  const numbers = normalizeNumbers(
    raw?.numbers ?? raw?.nums ?? raw?.selectedNumbers
  );
  if (numbers.length !== 6) return null;

  const source =
    raw?.source ??
    fallbackSource ??
    (raw?.modeLabel || raw?.note ? "simulator" : "generator");

  const createdAtValue =
    typeof raw?.createdAt === "number"
      ? new Date(raw.createdAt).toISOString()
      : raw?.createdAt ?? raw?.date ?? new Date().toISOString();

  return {
    id:
      raw?.id ??
      `${Date.now()}-${Math.random().toString(36).slice(2, 9)}-${numbers.join(
        "-"
      )}`,
    numbers,
    bonus: raw?.bonus ?? null,
    source,
    createdAt: createdAtValue,
    modeLabel: raw?.modeLabel ?? "",
    note: raw?.note ?? "",
  };
}

function readStorageList(
  key: string,
  fallbackSource?: string
): SavedNumberItem[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((item) => normalizeSavedItem(item, fallbackSource))
      .filter(Boolean) as SavedNumberItem[];
  } catch {
    return [];
  }
}

function mergeSavedItems(): SavedNumberItem[] {
  const buckets: SavedNumberItem[] = [
    ...readStorageList(STORAGE_KEY),
    ...readStorageList("savedLottoSets", "generator"),
  ];

  const map = new Map<string, SavedNumberItem>();

  for (const item of buckets) {
    const key = `${item.numbers.join(",")}-${item.source ?? "generator"}`;
    if (!map.has(key)) {
      map.set(key, item);
    }
  }

  return Array.from(map.values()).sort((a, b) => {
    const aTime = new Date(a.createdAt ?? "").getTime() || 0;
    const bTime = new Date(b.createdAt ?? "").getTime() || 0;
    return bTime - aTime;
  });
}

function saveUnifiedList(items: SavedNumberItem[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  localStorage.removeItem("savedLottoSets");
  window.dispatchEvent(new Event("storage"));
}

function clearLegacyKeys() {
  LEGACY_KEYS.forEach((key) => localStorage.removeItem(key));
}

function getSourceLabel(source?: string) {
  if (source === "simulator") return "추첨시뮬레이터";
  return "번호생성기";
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

function getNextSaturdayLabel() {
  const now = new Date();
  const day = now.getDay();
  const diff = (6 - day + 7) % 7;
  const next = new Date(now);
  next.setDate(now.getDate() + diff);

  const yyyy = next.getFullYear();
  const mm = String(next.getMonth() + 1).padStart(2, "0");
  const dd = String(next.getDate()).padStart(2, "0");

  return `${yyyy}-${mm}-${dd} 추첨예정`;
}

function getMatchResult(
  myNumbers: number[],
  draw?: LottoRow | null,
  isFutureRound?: boolean
) {
  if (isFutureRound) {
    return {
      matchCount: 0,
      bonusMatch: false,
      rankText: "판정대기",
      isWin: false,
      isPending: true,
    };
  }

  if (!draw) {
    return {
      matchCount: 0,
      bonusMatch: false,
      rankText: "판정대기",
      isWin: false,
      isPending: true,
    };
  }

  const matchCount = myNumbers.filter((n) => draw.numbers.includes(n)).length;
  const bonusMatch = myNumbers.includes(draw.bonus);

  let rankText = "낙첨";
  let isWin = false;

  if (matchCount === 6) {
    rankText = "1등";
    isWin = true;
  } else if (matchCount === 5 && bonusMatch) {
    rankText = "2등";
    isWin = true;
  } else if (matchCount === 5) {
    rankText = "3등";
    isWin = true;
  } else if (matchCount === 4) {
    rankText = "4등";
    isWin = true;
  } else if (matchCount === 3) {
    rankText = "5등";
    isWin = true;
  }

  return {
    matchCount,
    bonusMatch,
    rankText,
    isWin,
    isPending: false,
  };
}

export default function Purchase() {
  const [items, setItems] = useState<SavedNumberItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [filter, setFilter] = useState<SourceFilter>("all");

  const [drawRows, setDrawRows] = useState<LottoRow[]>([]);
  const [futureRound, setFutureRound] = useState<VirtualRound | null>(null);
  const [selectedRound, setSelectedRound] = useState<number | "">("");

  useEffect(() => {
    const load = () => {
      const merged = mergeSavedItems();
      setItems(merged);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
      clearLegacyKeys();
    };

    load();

    const handleStorage = () => load();
    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  useEffect(() => {
    fetch("/lotto_numbers.csv")
      .then((res) => {
        if (!res.ok) throw new Error("CSV 파일을 불러오지 못했습니다.");
        return res.text();
      })
      .then((text) => {
        const parsed = parseCsv(text);
        setDrawRows(parsed);

        if (parsed.length) {
          const nextRound: VirtualRound = {
            round: parsed[0].round + 1,
            date: getNextSaturdayLabel(),
          };
          setFutureRound(nextRound);
          setSelectedRound(nextRound.round);
        }
      })
      .catch(() => {
        setDrawRows([]);
      });
  }, []);

  const filteredItems = useMemo(() => {
    if (filter === "all") return items;
    return items.filter((item) => item.source === filter);
  }, [items, filter]);

  const totalCount = items.length;
  const generatorCount = items.filter(
    (item) => item.source !== "simulator"
  ).length;
  const simulatorCount = items.filter(
    (item) => item.source === "simulator"
  ).length;

  const isFutureSelected = useMemo(() => {
    return !!futureRound && selectedRound === futureRound.round;
  }, [futureRound, selectedRound]);

  const selectedDraw = useMemo(() => {
    if (isFutureSelected) return null;
    return drawRows.find((row) => row.round === selectedRound) ?? null;
  }, [drawRows, selectedRound, isFutureSelected]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]
    );
  };

  const handleDeleteSelected = () => {
    if (!selectedIds.length) return;

    const next = items.filter((item) => !selectedIds.includes(item.id));
    setItems(next);
    setSelectedIds([]);
    saveUnifiedList(next);
  };

  const handleDeleteAll = () => {
    setItems([]);
    setSelectedIds([]);
    localStorage.setItem(STORAGE_KEY, JSON.stringify([]));
    clearLegacyKeys();
    window.dispatchEvent(new Event("storage"));
  };

  return (
    <div className="purchase-page">
      <section className="purchase-hero">
        <div>
          <div className="purchase-kicker">PURCHASE MENU</div>
          <h2 className="purchase-title">구매메뉴</h2>
          <p className="purchase-desc">
            번호생성기와 추첨시뮬레이터에서 저장한 번호를 한 곳에서 모아보고,
            적용 회차 기준으로 당첨/낙첨을 확인합니다.
          </p>
        </div>
      </section>

      <section className="purchase-summary-card">
        <div className="purchase-summary-title">저장 현황</div>
        <div className="purchase-summary-row">
          <div className="purchase-stat primary">전체 {totalCount}개</div>
          <div className="purchase-stat">번호생성기 {generatorCount}개</div>
          <div className="purchase-stat">추첨시뮬레이터 {simulatorCount}개</div>
          <div className="purchase-stat">선택 {selectedIds.length}개</div>
        </div>
      </section>

      <section className="purchase-round-card">
        <div className="purchase-round-left">
          <div className="purchase-filter-title">적용 회차 선택</div>
          <div className="purchase-filter-sub">
            미래 회차를 포함해 원하는 기준 회차로 당첨/낙첨을 판정합니다.
          </div>
        </div>

        <div className="purchase-round-right">
          <select
            className="purchase-round-select"
            value={selectedRound}
            onChange={(e) => setSelectedRound(Number(e.target.value))}
          >
            {futureRound ? (
              <option value={futureRound.round}>
                {futureRound.round}회 ({futureRound.date})
              </option>
            ) : null}

            {drawRows.map((row) => (
              <option key={row.round} value={row.round}>
                {row.round}회 ({row.date})
              </option>
            ))}
          </select>

          {isFutureSelected ? (
            <div className="purchase-round-pending-box">
              <div className="purchase-round-info-title">기준 상태</div>
              <div className="purchase-round-pending-text">
                아직 추첨 전 회차입니다. 현재는 판정대기 상태로 표시됩니다.
              </div>
            </div>
          ) : selectedDraw ? (
            <div className="purchase-round-info">
              <div className="purchase-round-info-title">기준 당첨번호</div>
              <div className="purchase-round-balls">
                {selectedDraw.numbers.map((num) => (
                  <div
                    key={`draw-${selectedDraw.round}-${num}`}
                    className={`purchase-mini-ball ${getBallClass(num).replace(
                      "ball ",
                      ""
                    )}`}
                  >
                    {num}
                  </div>
                ))}
                <div className="purchase-bonus-divider">+</div>
                <div
                  className={`purchase-mini-ball bonus ${getBallClass(
                    selectedDraw.bonus
                  ).replace("ball ", "")}`}
                >
                  {selectedDraw.bonus}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </section>

      <section className="purchase-filter-card">
        <div className="purchase-filter-left">
          <div className="purchase-filter-title">출처별 보기</div>
          <div className="purchase-filter-sub">
            저장된 번호를 전체 / 번호생성기 / 추첨시뮬레이터 기준으로 나눠 볼 수 있습니다.
          </div>
        </div>

        <div className="purchase-filter-row">
          <button
            className={`purchase-chip ${filter === "all" ? "active" : ""}`}
            onClick={() => setFilter("all")}
          >
            전체
          </button>
          <button
            className={`purchase-chip ${filter === "generator" ? "active" : ""}`}
            onClick={() => setFilter("generator")}
          >
            번호생성기
          </button>
          <button
            className={`purchase-chip ${filter === "simulator" ? "active" : ""}`}
            onClick={() => setFilter("simulator")}
          >
            추첨시뮬레이터
          </button>
        </div>
      </section>

      <section className="purchase-list-card">
        <div className="purchase-list-top">
          <div>
            <div className="purchase-list-title">저장된 번호 목록</div>
            <div className="purchase-list-sub">
              출처 태그와 적용 회차 기준 판정 결과를 함께 확인할 수 있습니다.
            </div>
          </div>

          <div className="purchase-list-actions">
            <button className="purchase-action-btn" onClick={handleDeleteSelected}>
              선택 삭제
            </button>
            <button className="purchase-action-btn danger" onClick={handleDeleteAll}>
              전체 삭제
            </button>
          </div>
        </div>

        {!filteredItems.length ? (
          <div className="purchase-empty">
            현재 조건에서 표시할 저장 번호가 없습니다.
          </div>
        ) : (
          <div className="purchase-card-list">
            {filteredItems.map((item, index) => {
              const sourceClass =
                item.source === "simulator" ? "simulator" : "generator";

              const result = getMatchResult(
                item.numbers,
                selectedDraw,
                isFutureSelected
              );

              return (
                <article className="purchase-item-card" key={item.id}>
                  <div className="purchase-stamp-wrap">
                    <div
                      className={`purchase-stamp ${
                        result.isPending ? "pending" : result.isWin ? "win" : "lose"
                      }`}
                    >
                      {result.isPending
                        ? "판정대기"
                        : result.isWin
                        ? "당첨되었어요"
                        : "낙첨 아쉽지만 다음기회에"}
                    </div>
                  </div>

                  <div className="purchase-item-top">
                    <div className="purchase-item-left">
                      <div className="purchase-item-index">{index + 1}게임</div>

                      <div className="purchase-badges">
                        <span className={`purchase-source-badge ${sourceClass}`}>
                          {getSourceLabel(item.source)}
                        </span>

                        {item.modeLabel ? (
                          <span className="purchase-mode-badge">{item.modeLabel}</span>
                        ) : null}

                        <span
                          className={`purchase-rank-badge ${
                            result.isPending ? "pending" : result.isWin ? "win" : "lose"
                          }`}
                        >
                          {result.rankText}
                        </span>
                      </div>

                      <div className="purchase-created-at">
                        {item.createdAt
                          ? new Date(item.createdAt).toLocaleString("ko-KR")
                          : "-"}
                      </div>
                    </div>

                    <label className="purchase-check-wrap">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(item.id)}
                        onChange={() => toggleSelect(item.id)}
                      />
                      <span>선택</span>
                    </label>
                  </div>

                  <div className="purchase-number-row">
                    {item.numbers.map((num) => (
                      <div
                        key={`${item.id}-${num}`}
                        className={`purchase-ball ${getBallClass(num).replace(
                          "ball ",
                          ""
                        )}`}
                      >
                        {num}
                      </div>
                    ))}
                  </div>

                  <div className="purchase-result-info">
                    <div className="purchase-result-line">
                      {result.isPending ? (
                        <>추첨 전 회차이므로 결과 판정은 아직 대기 상태입니다.</>
                      ) : (
                        <>
                          일치 개수: <strong>{result.matchCount}개</strong>
                          {result.matchCount >= 5 ? (
                            <>
                              {" "}
                              / 보너스 일치: <strong>{result.bonusMatch ? "O" : "X"}</strong>
                            </>
                          ) : null}
                        </>
                      )}
                    </div>
                    <div className="purchase-number-text">{item.numbers.join(", ")}</div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <style>{`
        .purchase-page {
          width: 100%;
          max-width: 1320px;
          margin: 0 auto;
          padding: 22px 20px 60px;
          color: rgba(255,255,255,0.95);
        }

        .purchase-hero {
          margin-bottom: 18px;
        }

        .purchase-kicker {
          font-size: 12px;
          font-weight: 800;
          letter-spacing: 0.16em;
          color: rgba(132,163,255,0.92);
          margin-bottom: 8px;
        }

        .purchase-title {
          margin: 0;
          font-size: clamp(30px, 4vw, 42px);
          line-height: 1.1;
          font-weight: 900;
        }

        .purchase-desc {
          margin: 12px 0 0;
          font-size: 18px;
          line-height: 1.65;
          color: rgba(225,231,255,0.82);
        }

        .purchase-summary-card,
        .purchase-round-card,
        .purchase-filter-card,
        .purchase-list-card {
          border-radius: 28px;
          border: 1px solid rgba(255,255,255,0.08);
          background: linear-gradient(180deg, rgba(18,29,63,0.94), rgba(10,16,35,0.98));
          box-shadow:
            0 18px 50px rgba(0,0,0,0.26),
            inset 0 1px 0 rgba(255,255,255,0.05);
        }

        .purchase-summary-card {
          padding: 18px 18px 20px;
          margin-bottom: 18px;
        }

        .purchase-summary-title {
          font-size: 24px;
          font-weight: 900;
          margin-bottom: 14px;
        }

        .purchase-summary-row {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
        }

        .purchase-stat {
          min-height: 52px;
          padding: 0 18px;
          border-radius: 999px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 17px;
          font-weight: 800;
          background: rgba(18,26,54,0.96);
          border: 1px solid rgba(255,255,255,0.08);
          color: rgba(241,245,255,0.92);
        }

        .purchase-stat.primary {
          background: linear-gradient(180deg, rgba(90,123,255,0.98), rgba(63,90,205,0.98));
          border-color: rgba(158,179,255,0.38);
          box-shadow: 0 14px 34px rgba(53,84,204,0.22);
        }

        .purchase-round-card,
        .purchase-filter-card {
          padding: 18px;
          margin-bottom: 18px;
          display: flex;
          justify-content: space-between;
          gap: 16px;
          align-items: center;
        }

        .purchase-filter-title {
          font-size: 24px;
          font-weight: 900;
        }

        .purchase-filter-sub {
          margin-top: 6px;
          font-size: 15px;
          color: rgba(223,230,255,0.76);
        }

        .purchase-round-right {
          display: flex;
          flex-direction: column;
          gap: 12px;
          align-items: flex-end;
        }

        .purchase-round-select {
          height: 48px;
          min-width: 240px;
          padding: 0 14px;
          border-radius: 14px;
          border: 1px solid rgba(255,255,255,0.08);
          background: rgba(11,18,39,0.95);
          color: white;
          font-size: 15px;
          font-weight: 700;
          outline: none;
        }

        .purchase-round-info,
        .purchase-round-pending-box {
          display: flex;
          flex-direction: column;
          gap: 8px;
          align-items: flex-end;
        }

        .purchase-round-info-title {
          font-size: 14px;
          color: rgba(223,230,255,0.76);
        }

        .purchase-round-pending-text {
          max-width: 360px;
          padding: 12px 14px;
          border-radius: 14px;
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.08);
          font-size: 14px;
          line-height: 1.5;
          color: rgba(232,237,255,0.88);
          text-align: right;
        }

        .purchase-round-balls {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          align-items: center;
          justify-content: flex-end;
        }

        .purchase-mini-ball {
          width: 38px;
          aspect-ratio: 1 / 1;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 16px;
          font-weight: 900;
          color: #fff;
          flex: 0 0 38px;
        }

        .purchase-bonus-divider {
          font-size: 18px;
          font-weight: 900;
          color: rgba(255,255,255,0.8);
        }

        .purchase-filter-row {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
        }

        .purchase-chip {
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

        .purchase-chip.active {
          background: linear-gradient(180deg, rgba(87,123,255,0.96), rgba(63,90,205,0.96));
          border-color: rgba(159,182,255,0.48);
          box-shadow: 0 10px 24px rgba(50,84,195,0.26);
        }

        .purchase-list-card {
          padding: 18px;
        }

        .purchase-list-top {
          display: flex;
          justify-content: space-between;
          gap: 16px;
          align-items: center;
          margin-bottom: 18px;
        }

        .purchase-list-title {
          font-size: 24px;
          font-weight: 900;
        }

        .purchase-list-sub {
          margin-top: 6px;
          font-size: 15px;
          color: rgba(223,230,255,0.76);
        }

        .purchase-list-actions {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }

        .purchase-action-btn {
          min-width: 120px;
          height: 48px;
          border-radius: 14px;
          border: 1px solid rgba(255,255,255,0.08);
          background: rgba(18,26,54,0.96);
          color: white;
          font-size: 16px;
          font-weight: 800;
          cursor: pointer;
        }

        .purchase-action-btn.danger {
          background: linear-gradient(180deg, rgba(255,114,114,0.92), rgba(211,73,73,0.92));
        }

        .purchase-card-list {
          display: grid;
          gap: 16px;
        }

        .purchase-item-card {
          position: relative;
          padding: 18px;
          border-radius: 24px;
          border: 1px solid rgba(255,255,255,0.06);
          background: rgba(8,13,28,0.56);
          overflow: hidden;
        }

        .purchase-stamp-wrap {
          position: absolute;
          top: 16px;
          right: 16px;
          z-index: 1;
          pointer-events: none;
        }

        .purchase-stamp {
          min-width: 150px;
          max-width: 260px;
          min-height: 78px;
          padding: 12px 18px;
          border-radius: 22px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          text-align: center;
          font-size: 22px;
          line-height: 1.2;
          font-weight: 900;
          letter-spacing: -0.03em;
          transform: rotate(-8deg);
          backdrop-filter: blur(4px);
          box-shadow: 0 8px 24px rgba(0,0,0,0.18);
        }

        .purchase-stamp.win {
          color: rgba(255,239,175,0.98);
          border: 2px solid rgba(255,213,79,0.62);
          background:
            linear-gradient(180deg, rgba(255,189,15,0.22), rgba(255,145,0,0.12));
        }

        .purchase-stamp.lose {
          color: rgba(255,205,205,0.98);
          border: 2px solid rgba(255,112,112,0.5);
          background:
            linear-gradient(180deg, rgba(255,92,92,0.20), rgba(255,72,72,0.10));
        }

        .purchase-stamp.pending {
          color: rgba(205,223,255,0.98);
          border: 2px solid rgba(121,159,255,0.5);
          background:
            linear-gradient(180deg, rgba(80,129,255,0.18), rgba(58,97,211,0.10));
        }

        .purchase-item-top {
          display: flex;
          justify-content: space-between;
          gap: 14px;
          align-items: flex-start;
          margin-bottom: 16px;
          padding-right: 280px;
        }

        .purchase-item-index {
          font-size: 30px;
          font-weight: 900;
          margin-bottom: 10px;
        }

        .purchase-badges {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-bottom: 10px;
        }

        .purchase-source-badge,
        .purchase-mode-badge,
        .purchase-rank-badge {
          height: 32px;
          padding: 0 12px;
          border-radius: 999px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
          font-weight: 800;
        }

        .purchase-source-badge.generator {
          background: rgba(78,120,255,0.18);
          color: rgba(176,201,255,0.96);
          border: 1px solid rgba(108,146,255,0.28);
        }

        .purchase-source-badge.simulator {
          background: rgba(174,99,255,0.18);
          color: rgba(221,191,255,0.96);
          border: 1px solid rgba(191,129,255,0.28);
        }

        .purchase-mode-badge {
          background: rgba(255,255,255,0.08);
          color: rgba(230,236,255,0.88);
          border: 1px solid rgba(255,255,255,0.08);
        }

        .purchase-rank-badge.win {
          background: rgba(255,195,0,0.16);
          color: rgba(255,233,157,0.98);
          border: 1px solid rgba(255,213,79,0.3);
        }

        .purchase-rank-badge.lose {
          background: rgba(255,89,89,0.14);
          color: rgba(255,183,183,0.96);
          border: 1px solid rgba(255,112,112,0.26);
        }

        .purchase-rank-badge.pending {
          background: rgba(99,145,255,0.16);
          color: rgba(205,223,255,0.98);
          border: 1px solid rgba(121,159,255,0.32);
        }

        .purchase-created-at {
          font-size: 14px;
          color: rgba(223,230,255,0.72);
        }

        .purchase-check-wrap {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-size: 15px;
          font-weight: 700;
          color: rgba(240,244,255,0.88);
        }

        .purchase-number-row {
          display: flex;
          flex-wrap: wrap;
          gap: 14px;
          align-items: center;
          margin-bottom: 14px;
        }

        .purchase-ball {
          width: 74px;
          aspect-ratio: 1 / 1;
          height: auto;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 30px;
          font-weight: 900;
          color: #fff;
          box-shadow: 0 10px 22px rgba(0,0,0,0.26);
          flex: 0 0 74px;
        }

        .purchase-result-info {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .purchase-result-line {
          font-size: 15px;
          color: rgba(226,232,255,0.86);
        }

        .purchase-number-text {
          font-size: 19px;
          color: rgba(226,232,255,0.86);
        }

        .purchase-empty {
          min-height: 220px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 22px;
          background: rgba(8,13,28,0.56);
          border: 1px solid rgba(255,255,255,0.06);
          font-size: 20px;
          font-weight: 800;
          color: rgba(220,228,255,0.74);
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

        @media (max-width: 960px) {
          .purchase-round-card,
          .purchase-filter-card,
          .purchase-list-top,
          .purchase-item-top {
            flex-direction: column;
            align-items: flex-start;
          }

          .purchase-round-right {
            align-items: flex-start;
          }

          .purchase-round-balls {
            justify-content: flex-start;
          }

          .purchase-item-top {
            padding-right: 0;
          }

          .purchase-stamp-wrap {
            position: static;
            margin-bottom: 14px;
          }

          .purchase-stamp {
            transform: none;
          }

          .purchase-round-pending-text {
            text-align: left;
          }
        }

        @media (max-width: 560px) {
          .purchase-page {
            padding: 18px 14px 48px;
          }

          .purchase-title,
          .purchase-summary-title,
          .purchase-filter-title,
          .purchase-list-title {
            font-size: 22px;
          }

          .purchase-desc {
            font-size: 15px;
          }

          .purchase-ball {
            width: 62px;
            font-size: 24px;
            flex: 0 0 62px;
          }

          .purchase-item-index {
            font-size: 24px;
          }

          .purchase-number-text {
            font-size: 16px;
          }

          .purchase-round-select {
            min-width: 100%;
          }

          .purchase-stamp {
            min-width: 100%;
            max-width: 100%;
            font-size: 18px;
          }
        }
      `}</style>
    </div>
  );
}