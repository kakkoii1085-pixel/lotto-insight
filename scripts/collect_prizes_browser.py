"""
Playwright로 dhlottery.co.kr 페이지를 직접 탐색하며 당첨정보 수집
- API XHR 방식 대신 페이지 직접 이동 → RSA 봇 감지 우회
- 설치: pip install playwright && python -m playwright install chromium
- 실행: python scripts/collect_prizes_browser.py
"""

import json, os, asyncio, csv, time
from playwright.async_api import async_playwright

BASE_DIR    = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DETAIL_JSON = os.path.join(BASE_DIR, "public", "lotto_history_details.json")
BACKUP_FILE = os.path.join(os.path.expanduser("~"), "lotto_prizes_backup.json")
CSV_FILE    = os.path.join(BASE_DIR, "public", "lotto_numbers.csv")
API_URL     = "https://www.dhlottery.co.kr/common.do?method=getLottoNumber&drwNo={}"

def read_rounds():
    with open(CSV_FILE, "r", encoding="utf-8-sig") as f:
        return sorted(set(int(r["회차"]) for r in csv.DictReader(f) if r.get("회차","").isdigit()))

def load_json(path):
    try:
        with open(path, "r", encoding="utf-8") as f: return json.load(f)
    except: return {}

def save_json(data):
    os.makedirs(os.path.dirname(DETAIL_JSON), exist_ok=True)
    tmp = DETAIL_JSON + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f: json.dump(data, f, ensure_ascii=False, indent=2)
    os.replace(tmp, DETAIL_JSON)
    with open(BACKUP_FILE, "w", encoding="utf-8") as f: json.dump(data, f, ensure_ascii=False, indent=2)

def has_valid(entry):
    return any(p.get("rank") == "1등" and p.get("winners", 0) > 0 for p in entry.get("prizes", []))

def parse_response(text, round_no):
    """페이지 본문에서 당첨 데이터 추출"""
    try:
        d = json.loads(text.strip())
        if d.get("returnValue") == "success":
            return {"round": round_no, "prizes": [{
                "rank": "1등",
                "amount": int(d.get("firstWinamnt", 0)),
                "winners": int(d.get("firstPrzwnerCo", 0)),
            }]}
    except: pass
    return None

async def fetch_round(page, round_no, use_js=False):
    """단일 회차 수집 (JS fetch 또는 페이지 탐색)"""
    if use_js:
        try:
            text = await page.evaluate(f"""async () => {{
                const r = await fetch('{API_URL.format(round_no)}', {{
                    headers: {{'Accept':'application/json','X-Requested-With':'XMLHttpRequest'}}
                }});
                return await r.text();
            }}""")
            result = parse_response(text, round_no)
            if result: return result, True   # JS 성공
        except: pass

    # 페이지 직접 탐색 (RSA 챌린지 자동 처리)
    try:
        await page.goto(API_URL.format(round_no), wait_until="domcontentloaded", timeout=15000)
        await asyncio.sleep(0.5)
        text = await page.inner_text("body")
        result = parse_response(text, round_no)
        if result: return result, False   # 탐색 성공
    except: pass

    return {"round": round_no, "prizes": []}, False

async def main():
    rounds  = read_rounds()
    updated = load_json(DETAIL_JSON)
    backup  = load_json(BACKUP_FILE)
    bv = sum(1 for v in backup.values() if has_valid(v))
    mv = sum(1 for v in updated.values() if has_valid(v))
    if bv > mv:
        print(f"백업 사용 ({bv} > {mv}개)")
        updated = backup

    need = [r for r in rounds if not has_valid(updated.get(str(r), {}))]
    have = sum(1 for v in updated.values() if has_valid(v))
    print(f"전체: {len(rounds)}회  /  완료: {have}개  /  남은 작업: {len(need)}개")
    if not need:
        print("✅ 이미 모두 수집됐습니다.")
        save_json(updated); return

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False)   # 화면에 보이게 실행
        ctx = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            locale="ko-KR", viewport={"width":1280,"height":800},
        )
        page = await ctx.new_page()

        # 메인 페이지로 세션 초기화
        print("브라우저 열어서 동행복권 접속 중...")
        await page.goto("https://www.dhlottery.co.kr/", wait_until="networkidle", timeout=20000)
        await asyncio.sleep(2)

        # 첫 회차를 페이지 탐색으로 → 세션 수립
        print(f"첫 회차 페이지 탐색으로 세션 수립 중 ({need[0]}회)...")
        result, _ = await fetch_round(page, need[0], use_js=False)
        updated[str(need[0])] = result
        if has_valid(result):
            w = result["prizes"][0]["winners"]
            a = result["prizes"][0]["amount"]
            print(f"✅ 세션 수립 성공! ({need[0]}회: 1등 {w}명, {a:,}원)")
            use_js = True  # 이후는 JS fetch 사용
        else:
            print(f"⚠️  {need[0]}회 데이터 없음 (페이지 탐색 계속)")
            use_js = False

        done = 1; failed = 0; js_ok = 0; nav_ok = 0
        start = time.time()

        for i, round_no in enumerate(need[1:], 1):
            result, was_js = await fetch_round(page, round_no, use_js=use_js)
            updated[str(round_no)] = result

            if has_valid(result):
                done += 1
                if was_js: js_ok += 1
                else: nav_ok += 1
            else:
                failed += 1
                use_js = False  # 실패시 다시 페이지 탐색으로 전환

            # JS fetch가 3번 연속 실패하면 페이지 탐색으로 고정
            if not was_js and use_js:
                use_js = False

            if done % 10 == 0:
                save_json(updated)

            if (i+1) % 50 == 0:
                save_json(updated)
                elapsed = time.time() - start
                speed = (done + failed) / elapsed if elapsed > 0 else 1
                remain = (len(need) - i) / speed
                valid = sum(1 for v in updated.values() if has_valid(v))
                print(f"진행 {i+1}/{len(need)}  (~{int(remain)}초 남음)  "
                      f"유효: {valid}개  JS:{js_ok} 탐색:{nav_ok} 실패:{failed}")

            await asyncio.sleep(0.1 if use_js else 0.5)

        await browser.close()

    save_json(updated)
    valid_total = sum(1 for v in updated.values() if has_valid(v))
    print(f"\n✅ 완료!")
    print(f"총 유효 데이터: {valid_total}/{len(rounds)}개  (JS:{js_ok} 탐색:{nav_ok} 실패:{failed})")
    if valid_total > 0:
        print(f"\ngit 반영:")
        print(f"  git add public/lotto_history_details.json")
        print(f'  git commit -m "chore: 당첨정보 수집"')
        print(f"  git push origin main")

if __name__ == "__main__":
    asyncio.run(main())
