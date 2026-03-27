/**
 * Vercel 서버리스 함수 - 동행복권 1등 prize 데이터 프록시
 * 호출: /api/prize?round=1216
 * Node.js 18+ 필요 (vercel.json 에서 runtime 지정)
 */
export default async function handler(req, res) {
  // CORS 허용
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const round = parseInt(req.query.round, 10);
  if (!round || round < 1) {
    return res.status(400).json({ error: 'round 파라미터가 필요합니다.' });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);

  try {
    const response = await fetch(
      `https://www.dhlottery.co.kr/common.do?method=getLottoNumber&drwNo=${round}`,
      {
        method: 'GET',
        headers: {
          'Accept': 'application/json, text/javascript, */*; q=0.01',
          'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Referer': 'https://www.dhlottery.co.kr/gameResult.do?method=byWin',
          'X-Requested-With': 'XMLHttpRequest',
        },
        signal: controller.signal,
      }
    );

    clearTimeout(timer);

    if (!response.ok) {
      console.error(`dhlottery HTTP error: ${response.status}`);
      return res.status(200).json({ round, prizes: [] });
    }

    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      console.error('JSON parse error, body:', text.slice(0, 200));
      return res.status(200).json({ round, prizes: [] });
    }

    if (data.returnValue !== 'success') {
      return res.status(200).json({ round, prizes: [] });
    }

    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate');
    return res.status(200).json({
      round,
      prizes: [
        {
          rank: '1등',
          amount: parseInt(String(data.firstWinamnt ?? '0'), 10),
          winners: parseInt(String(data.firstPrzwnerCo ?? '0'), 10),
        },
      ],
    });
  } catch (e) {
    clearTimeout(timer);
    const msg = e instanceof Error ? e.message : String(e);
    console.error('Prize fetch error:', msg);
    // 500 대신 200 + 빈 배열 반환 (클라이언트에서 처리 가능하게)
    return res.status(200).json({ round, prizes: [], error: msg });
  }
}
