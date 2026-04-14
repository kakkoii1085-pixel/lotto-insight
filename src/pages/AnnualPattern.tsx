import { useEffect, useMemo, useState } from "react";

// ───────────── 타입 ─────────────
type LottoDraw = { round: number; date: string; numbers: number[]; bonus: number };
type FreqGroup = { freq: number; numbers: number[] };
type YearStat  = { year: string; totalDraws: number; freqMap: Record<number,number>; groups: FreqGroup[] };
// 공 선택 상태: none / predict(초록) / exclude(노랑)
type BallMark = "none" | "predict" | "exclude";

// ────────── 데이터 로딩 ──────────
async function loadHistory(): Promise<LottoDraw[]> {
  const res  = await fetch("/lotto_numbers.csv");
  const text = await res.text();
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length <= 1) return [];
  return lines.slice(1).map(line => {
    const cols = line.split(",");
    if (cols.length < 10) return null;
    const round   = Number(cols[1]);
    const date    = cols[2];
    const numbers = cols.slice(3, 9).map(Number);
    const bonus   = Number(cols[9]);
    if ([round, ...numbers, bonus].some(isNaN)) return null;
    return { round, date, numbers, bonus };
  }).filter((d): d is LottoDraw => d !== null)
    .sort((a, b) => a.round - b.round);
}

// ────────── 연간/52주 통계 ──────────
function buildFreqGroups(freqMap: Record<number,number>): FreqGroup[] {
  const m: Record<number, number[]> = {};
  for (let n = 1; n <= 45; n++) {
    const f = freqMap[n];
    if (!m[f]) m[f] = [];
    m[f].push(n);
  }
  return Object.entries(m)
    .map(([f, ns]) => ({ freq: Number(f), numbers: ns.sort((a,b)=>a-b) }))
    .sort((a,b) => a.freq - b.freq);
}

function buildFreqMap(draws: LottoDraw[]): Record<number,number> {
  const fm: Record<number,number> = {};
  for (let n = 1; n <= 45; n++) fm[n] = 0;
  draws.forEach(d => d.numbers.forEach(n => { fm[n]++; }));
  return fm;
}

function computeYearStats(draws: LottoDraw[]): YearStat[] {
  const byYear: Record<string, LottoDraw[]> = {};
  draws.forEach(d => { const y = d.date.slice(0,4); (byYear[y]=byYear[y]||[]).push(d); });
  return Object.entries(byYear).sort(([a],[b])=>Number(a)-Number(b))
    .map(([year,ys]) => {
      const freqMap = buildFreqMap(ys);
      return { year, totalDraws: ys.length, freqMap, groups: buildFreqGroups(freqMap) };
    });
}

function compute52WeekStats(draws: LottoDraw[]): YearStat {
  const recent = draws.slice(-52);
  const freqMap = buildFreqMap(recent);
  const f = recent[0], l = recent[recent.length-1];
  return { year: `52주 기준 (${f?.round}회~${l?.round}회)`, totalDraws: recent.length, freqMap, groups: buildFreqGroups(freqMap) };
}

// ────────── 과년도 평균 balls/freq 계산 ──────────
// 완전한 연도(52회 이상)만 사용하여 각 freq별 평균 공의수 계산
function computeAvgBallsPerFreq(yearStats: YearStat[]): Record<number, number> {
  const fullYears = yearStats.filter(ys => ys.totalDraws >= 45);
  if (fullYears.length === 0) return {};
  const totals: Record<number, number[]> = {};
  fullYears.forEach(ys => {
    ys.groups.forEach(g => {
      if (!totals[g.freq]) totals[g.freq] = [];
      totals[g.freq].push(g.numbers.length);
    });
    // freq가 0인 경우도 포함 (해당 연도에 그룹 없으면 0)
    for (let f = 0; f <= 14; f++) {
      if (!ys.groups.find(g => g.freq === f)) {
        if (!totals[f]) totals[f] = [];
        totals[f].push(0);
      }
    }
  });
  const avg: Record<number, number> = {};
  Object.entries(totals).forEach(([f, vals]) => {
    avg[Number(f)] = vals.reduce((a,b)=>a+b,0) / vals.length;
  });
  return avg;
}

// ────────── 공 색상 ──────────
function ballClass(n: number) {
  if (n <= 10) return "ap-ball ball yellow";
  if (n <= 20) return "ap-ball ball navy";
  if (n <= 30) return "ap-ball ball red";
  if (n <= 40) return "ap-ball ball gray";
  return "ap-ball ball green";
}

// ────────── 저장 ──────────
const STORAGE_KEY = "savedNumbers";
type SavedItem = { id: string; numbers: number[]; bonus?: number|null; source?: string; createdAt: string; modeLabel?: string; note?: string };
function appendSaved(item: SavedItem) {
  try {
    const list: SavedItem[] = JSON.parse(localStorage.getItem(STORAGE_KEY)||"[]");
    list.push(item); localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // ignore localStorage errors
  }
}

const GROUP_COLORS = ["#e8f5e9","#fff9c4","#fff3e0","#e3f2fd","#fce4ec","#ede7f6","#e0f7fa","#f1f8e9","#fff8e1","#fbe9e7","#e8eaf6","#f3e5f5","#e0f2f1","#fafafa","#f9fbe7"];

// ────────── 예측 점수 계산 ──────────
interface PredictionScore {
  number: number;
  score: number;
  deviation: number;
  recentTrend: number;
  isOverdue: boolean;
}

function calculatePredictionScores(
  draws: LottoDraw[],
  recentCount: number = 10
): PredictionScore[] {
  if (draws.length === 0) return [];

  const allFreq = buildFreqMap(draws);
  const expectedFreq = 6 * draws.length / 45;
  const recentDraws = draws.slice(-recentCount);
  const recentFreq = buildFreqMap(recentDraws);

  const scores: PredictionScore[] = [];

  for (let n = 1; n <= 45; n++) {
    const freq = allFreq[n];
    const deviation = freq - expectedFreq;
    const recentFreqVal = recentFreq[n] || 0;
    const recentTrend = recentFreqVal / (recentCount / (draws.length / 45));
    const lastAppear = draws.findIndex(d => d.numbers.includes(n));
    const drawsSinceAppear = lastAppear >= 0 ? draws.length - lastAppear : draws.length;
    const isOverdue = drawsSinceAppear > draws.length * 0.3;

    let score = 0;
    score += Math.abs(deviation) * 2;
    score += recentTrend * 3;
    score += (isOverdue ? 2 : 0);

    scores.push({
      number: n,
      score: Math.max(0, score),
      deviation,
      recentTrend,
      isOverdue
    });
  }

  return scores.sort((a, b) => b.score - a.score);
}

// ────────── 메인 컴포넌트 ──────────
export default function AnnualPattern() {
  const [draws,       setDraws]       = useState<LottoDraw[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [viewMode,    setViewMode]    = useState<"52week"|"yearly">("52week");
  const defaultYear = String(new Date().getFullYear() - 1);
  const [selectedYear, setSelectedYear] = useState<string>(defaultYear);

  // 공 선택 상태 (번호 → none/predict/exclude)
  const [ballMarks, setBallMarks] = useState<Record<number, BallMark>>({});

  // 가/감 (freq range shift)
  const [freqAdj, setFreqAdj] = useState(0);

  // 최근 N회 필터
  const [trendWindow, setTrendWindow] = useState<10|20|50|"all">("all");

  const [generated, setGenerated] = useState<number[]>([]);
  const [savedMsg,  setSavedMsg]  = useState("");
  const [genNote,   setGenNote]   = useState("");

  useEffect(() => {
    loadHistory().then(d => { setDraws(d); setLoading(false); });
  }, []);

  const yearStats  = useMemo(() => computeYearStats(draws),   [draws]);
  const stat52     = useMemo(() => compute52WeekStats(draws),  [draws]);
  const avgPerFreq = useMemo(() => computeAvgBallsPerFreq(yearStats), [yearStats]);
  const years      = useMemo(() => yearStats.map(y => y.year), [yearStats]);

  // 트렌드 윈도우 기반 예측 점수
  const predictionScores = useMemo(
    () => calculatePredictionScores(draws, trendWindow === "all" ? draws.length : typeof trendWindow === "number" ? trendWindow : 10),
    [draws, trendWindow]
  );

  const currentStat = useMemo(() => {
    if (viewMode === "52week") return stat52;
    return (
      yearStats.find(y => y.year === selectedYear) ??
      yearStats.find(y => y.year === defaultYear)  ??
      yearStats[yearStats.length - 2] ?? yearStats[yearStats.length - 1]
    );
  }, [viewMode, selectedYear, stat52, yearStats, defaultYear]);

  // 가/감 적용 → 현재 그룹의 freq를 shift 해서 표시용 그룹 생성
  const displayGroups = useMemo(() => {
    if (!currentStat) return [];
    return currentStat.groups.map(g => ({
      ...g,
      dispFreq: Math.max(0, g.freq + freqAdj),
    }));
  }, [currentStat, freqAdj]);

  // 공 클릭: none → predict → exclude → none
  function toggleBall(n: number) {
    setBallMarks(prev => {
      const cur = prev[n] || "none";
      const next: BallMark = cur === "none" ? "predict" : cur === "predict" ? "exclude" : "none";
      return { ...prev, [n]: next };
    });
  }

  // 선택 초기화
  function clearMarks() { setBallMarks({}); setGenerated([]); setSavedMsg(""); }

  // 선택 통계
  const predictNums = useMemo(() =>
    Object.entries(ballMarks).filter(([,v])=>v==="predict").map(([k])=>Number(k)).sort((a,b)=>a-b),
    [ballMarks]);
  const excludeNums = useMemo(() =>
    Object.entries(ballMarks).filter(([,v])=>v==="exclude").map(([k])=>Number(k)).sort((a,b)=>a-b),
    [ballMarks]);

  // 번호 추출: 초록(predict)에서 랜덤 6개 선택
  function handleExtract() {
    if (predictNums.length === 0) return;
    const pool = [...predictNums];
    for (let i = pool.length-1; i > 0; i--) {
      const j = Math.floor(Math.random()*(i+1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    setGenerated(pool.slice(0, 6).sort((a,b)=>a-b));
    setSavedMsg("");
  }

  // AI 자동 추천: 가장 높은 예측 점수의 6개 번호 (제외 제외)
  function handleAIRecommend() {
    const excludeSet = new Set(excludeNums);
    const candidates = predictionScores.filter(ps => !excludeSet.has(ps.number));
    const recommended = candidates.slice(0, 6).map(ps => ps.number).sort((a,b)=>a-b);
    setGenerated(recommended);
    setSavedMsg("");
  }

  function handleSave() {
    if (generated.length === 0) return;
    appendSaved({ id: crypto.randomUUID(), numbers: generated, source: "generator", modeLabel: "연간분포패턴", note: genNote||undefined, createdAt: new Date().toISOString() });
    setSavedMsg("구매메뉴에 저장되었습니다!");
    setTimeout(() => setSavedMsg(""), 3000);
  }

  if (loading) return <div className="ap-page"><div className="history-loading">데이터 불러오는 중...</div></div>;

  return (
    <div className="ap-page">
      {/* 헤더 */}
      <section className="history-header-card">
        <div>
          <p className="history-eyebrow">ANNUAL PATTERN</p>
          <h2 className="history-title">연간 출현 분포 패턴</h2>
          <p className="history-subtitle">
            공을 클릭해 <span style={{color:"#7ad11f",fontWeight:700}}>초록(출현예측)</span> /
            <span style={{color:"#f3c400",fontWeight:700}}> 노랑(배제)</span> 으로 표시한 뒤
            가/감 조정 후 번호를 추출합니다.
            과년도 평균 대비 현재 출현횟수 편차도 확인하세요.
          </p>
        </div>
      </section>

      {/* 뷰 전환 */}
      <div className="tp-tab-row">
        <button className={`toggleBtn ${viewMode==="52week"?"active":""}`} onClick={()=>setViewMode("52week")}>52주 기준 (최신)</button>
        <button className={`toggleBtn ${viewMode==="yearly"?"active":""}`} onClick={()=>setViewMode("yearly")}>연도별 선택</button>
      </div>

      {viewMode === "yearly" && (
        <div className="tp-filter-row">
          <span className="fieldLabel">연도 선택</span>
          <select className="input tp-select" value={selectedYear} onChange={e=>setSelectedYear(e.target.value)}>
            {years.map(y => <option key={y} value={y}>{y}년</option>)}
          </select>
        </div>
      )}

      {/* ─── 예측 점수 바 ─── */}
      <section className="panel ap-score-panel">
        <h3 className="panelTitle">예측 점수 순위 (상위 15개)</h3>
        <p className="panelSubText" style={{marginBottom:12}}>
          편차 + 최근 트렌드 + 초과연체 등을 종합한 예측 점수입니다.
        </p>
        <div className="ap-score-list">
          {predictionScores.slice(0, 15).map((ps, idx) => (
            <div key={ps.number} className="ap-score-row">
              <span className="ap-score-rank">#{idx + 1}</span>
              <span className={`ap-ball ${ballClass(ps.number)}`}>{ps.number}</span>
              <div className="ap-score-bar-container">
                <div className="barTrack ap-score-track">
                  <div
                    className="barFill ap-score-fill"
                    style={{ width: `${(ps.score / (predictionScores[0]?.score || 1)) * 100}%` }}
                  />
                </div>
              </div>
              <span className="ap-score-val">{ps.score.toFixed(1)}</span>
              <span className="ap-score-badge" style={{color: ps.isOverdue ? "#ff6b6b" : "#888"}}>
                {ps.isOverdue ? "연체" : "정상"}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* ─── 45번 히트맵 ─── */}
      <section className="panel ap-heatmap-panel">
        <h3 className="panelTitle">45번 히트맵 (클릭으로 선택/배제)</h3>
        <p className="panelSubText" style={{marginBottom:12}}>
          색상이 짙을수록 출현 빈도가 높습니다. 클릭하여 직접 선택/배제할 수 있습니다.
        </p>
        <div className="ap-heatmap-grid">
          {Array.from({ length: 45 }, (_, i) => i + 1).map(n => {
            const freq = currentStat?.freqMap?.[n] || 0;
            const maxFreq = Math.max(...Object.values(currentStat?.freqMap || {}), 1);
            const intensity = freq / maxFreq;
            const mark = ballMarks[n] || "none";
            return (
              <button
                key={n}
                type="button"
                className={`ap-heatmap-cell ap-ball ${ballClass(n)} ap-mark-${mark}`}
                style={{
                  backgroundColor: `rgba(82, 122, 245, ${intensity * 0.7})`,
                  opacity: 0.5 + intensity * 0.5,
                }}
                onClick={() => toggleBall(n)}
                title={`${n}번: ${freq}회 (클릭: ${mark === "predict" ? "예측 해제" : mark === "exclude" ? "배제 해제" : "예측 선택"})`}
              >
                {n}
              </button>
            );
          })}
        </div>
      </section>

      {/* ─── 출현횟수 분포 테이블 ─── */}
      {currentStat && (
        <section className="panel ap-dist-panel">
          <div className="ap-dist-title-row">
            <h3 className="panelTitle">
              <span className="ap-year-label">{currentStat.year}</span>
              {" — "}출현횟수별 번호 분포
            </h3>
            {freqAdj !== 0 && (
              <span className="ap-adj-badge">가/감 {freqAdj>0?"+":""}{freqAdj} 적용 중</span>
            )}
          </div>
          <p className="panelSubText" style={{marginBottom:12}}>
            총 {currentStat.totalDraws}회 추첨 기준 &nbsp;|&nbsp;
            공 클릭 → <span style={{color:"#7ad11f"}}>■ 출현예측</span> → <span style={{color:"#f3c400"}}>■ 배제</span> → 해제
          </p>

          {/* 가/감 컨트롤 */}
          <div className="ap-adj-ctrl">
            <span className="fieldLabel">출현횟수 가/감</span>
            <button className="subBtn ap-adj-btn" onClick={()=>setFreqAdj(f=>f-1)}>－1</button>
            <span className="ap-adj-val">{freqAdj>=0?`+${freqAdj}`:freqAdj}</span>
            <button className="subBtn ap-adj-btn" onClick={()=>setFreqAdj(f=>f+1)}>＋1</button>
            <button className="subBtn ap-adj-btn" style={{marginLeft:8}} onClick={()=>setFreqAdj(0)}>초기화</button>
          </div>

          <div className="ap-dist-table">
            {/* 헤더 */}
            <div className="ap-dist-header ap-dist-header-v2">
              <span>출현횟수</span>
              <span>해당 번호들 (클릭으로 선택/배제)</span>
              <span className="ap-col-cnt">공의수</span>
              <span className="ap-col-avg">평균</span>
              <span className="ap-col-diff">±편차</span>
            </div>
            {/* 행 */}
            {displayGroups.map(g => {
              const avg  = avgPerFreq[g.freq] ?? 0;
              const diff = g.numbers.length - avg;
              return (
                <div key={g.freq} className="ap-dist-row ap-dist-row-v2">
                  <span className="ap-col-freq ap-freq-badge">{g.dispFreq}회</span>
                  <div className="ap-col-nums ap-balls-row">
                    {g.numbers.map(n => {
                      const mark = ballMarks[n] || "none";
                      return (
                        <button
                          key={n}
                          type="button"
                          className={`ap-ball-btn ${ballClass(n)} ap-mark-${mark}`}
                          onClick={() => toggleBall(n)}
                          title={mark === "predict" ? "출현예측" : mark === "exclude" ? "배제" : "클릭하여 선택"}
                        >{n}</button>
                      );
                    })}
                  </div>
                  <span className="ap-col-cnt">{g.numbers.length}</span>
                  <span className="ap-col-avg">{avg > 0 ? avg.toFixed(1) : "—"}</span>
                  <span className={`ap-col-diff ${diff > 0 ? "ap-diff-pos" : diff < 0 ? "ap-diff-neg" : ""}`}>
                    {avg > 0 ? (diff > 0 ? `+${diff.toFixed(1)}` : diff.toFixed(1)) : "—"}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ─── 선택 현황 + 추출 ─── */}
      <section className="panel ap-select-panel">
        <h3 className="panelTitle">선택 번호 현황 및 추출</h3>

        <div className="ap-select-summary">
          <div className="ap-select-group">
            <span className="ap-select-label ap-label-predict">▶ 출현예측 ({predictNums.length}개)</span>
            <div className="ap-select-balls">
              {predictNums.length === 0
                ? <span className="panelSubText">없음 (공을 클릭하여 선택)</span>
                : predictNums.map(n => (
                    <button key={n} type="button" className={`ap-ball-btn ${ballClass(n)} ap-mark-predict`} onClick={()=>toggleBall(n)}>{n}</button>
                  ))
              }
            </div>
          </div>
          <div className="ap-select-group">
            <span className="ap-select-label ap-label-exclude">▶ 배제 ({excludeNums.length}개)</span>
            <div className="ap-select-balls">
              {excludeNums.length === 0
                ? <span className="panelSubText">없음</span>
                : excludeNums.map(n => (
                    <button key={n} type="button" className={`ap-ball-btn ${ballClass(n)} ap-mark-exclude`} onClick={()=>toggleBall(n)}>{n}</button>
                  ))
              }
            </div>
          </div>
        </div>

        {/* 트렌드 윈도우 선택 */}
        <div className="ap-trend-selector">
          <span className="fieldLabel">트렌드 기준</span>
          <button
            className={`toggleBtn ${trendWindow === "all" ? "active" : ""}`}
            onClick={() => setTrendWindow("all")}
          >전체</button>
          <button
            className={`toggleBtn ${trendWindow === 50 ? "active" : ""}`}
            onClick={() => setTrendWindow(50)}
          >최근 50회</button>
          <button
            className={`toggleBtn ${trendWindow === 20 ? "active" : ""}`}
            onClick={() => setTrendWindow(20)}
          >최근 20회</button>
          <button
            className={`toggleBtn ${trendWindow === 10 ? "active" : ""}`}
            onClick={() => setTrendWindow(10)}
          >최근 10회</button>
        </div>

        <div className="buttonRow" style={{marginTop:16}}>
          <button
            className="primaryBtn"
            onClick={handleAIRecommend}
          >
            AI 추천 6개
          </button>
          <button
            className="primaryBtn"
            onClick={handleExtract}
            disabled={predictNums.length === 0}
          >
            출현예측 추출 6개
          </button>
          <button className="subBtn" onClick={clearMarks}>선택 초기화</button>
        </div>

        {generated.length > 0 && (
          <div className="ap-result-box">
            <p className="panelSubText" style={{marginBottom:10}}>추출 결과</p>
            <div className="balls" style={{marginBottom:16}}>
              {generated.map(n => <span key={n} className={`${ballClass(n)} ap-mark-predict`}>{n}</span>)}
              {generated.length < 6 && <span className="panelSubText" style={{marginLeft:8}}>(선택 {predictNums.length}개 중 {generated.length}개)</span>}
            </div>
            <div className="tp-save-row">
              <input className="input" type="text" placeholder="메모 (선택)" value={genNote} onChange={e=>setGenNote(e.target.value)} style={{maxWidth:220}}/>
              <button className="primaryBtn" onClick={handleSave}>구매메뉴에 저장</button>
              {savedMsg && <span className="tp-saved-msg">{savedMsg}</span>}
            </div>
          </div>
        )}
      </section>

      {/* ─── 연도별 패턴 모양 비교 ─── */}
      <section className="panel ap-shape-panel">
        <h3 className="panelTitle">연도별 출현분포 패턴 모양 비교</h3>
        <p className="panelSubText">각 연도별 출현횟수 분포를 막대그래프로 비교 — 년말 추세 예측에 활용하세요.</p>
        <div className="ap-shape-grid">
          {yearStats.slice(-8).map(ys => (
            <div key={ys.year} className="ap-shape-card">
              <div className="ap-shape-title">{ys.year}년</div>
              <div className="ap-shape-bars">
                {ys.groups.map(g => (
                  <div key={g.freq} className="ap-shape-bar-col">
                    <div className="ap-shape-bar-fill" style={{height:`${(g.numbers.length/10)*100}%`,backgroundColor:GROUP_COLORS[g.freq%GROUP_COLORS.length]}} title={`${g.freq}회: ${g.numbers.length}개`}/>
                    <div className="ap-shape-bar-label">{g.freq}</div>
                  </div>
                ))}
              </div>
              <div className="ap-shape-meta">{ys.totalDraws}회</div>
            </div>
          ))}
          <div className="ap-shape-card ap-shape-card-highlight">
            <div className="ap-shape-title">52주(현재)</div>
            <div className="ap-shape-bars">
              {stat52.groups.map(g => (
                <div key={g.freq} className="ap-shape-bar-col">
                  <div className="ap-shape-bar-fill" style={{height:`${(g.numbers.length/10)*100}%`,backgroundColor:GROUP_COLORS[g.freq%GROUP_COLORS.length]}} title={`${g.freq}회: ${g.numbers.length}개`}/>
                  <div className="ap-shape-bar-label">{g.freq}</div>
                </div>
              ))}
            </div>
            <div className="ap-shape-meta">{stat52.totalDraws}회</div>
          </div>
        </div>
      </section>
    </div>
  );
}
