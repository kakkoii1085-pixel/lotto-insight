"""
Playwright 브라우저로 동행복권 1등 당첨정보 수집
설치: pip install playwright && python -m playwright install chromium

실행: python scripts/collect_prizes_browser.py
"""

import json
import os
import asyncio
from playwright.async_api import async_playwright

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DETAIL_JSON = os.path.join(BASE_DIR, "public", "lotto_history_details.json")
BACKUP_FILE = os.path.join(os.path.expanduser("~"), "lotto_prizes_backup.json")
CSV_FILE    = os.path.join(BASE_DIR, "public", "lotto_numbers.csv")

def read_rounds():
    import csv
    with open(CSV_FILE, "r", encoding="utf-8-sig") as f:
        return sorted(set(int(r["회차"]) for r in csv.DictReader(f) if r.get("회차","").isdigit()))

def load_json(path):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except:
        return {}

def save_json(data):
    os.makedirs(os.path.dirname(DETAIL_JSON), exist_ok=True)
    tmp = DETAIL_JSON + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    os.replace(tmp, DETAIL_JSON)
    with open(BACKUP_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def has_valid(entry):
    return any(p.get("rank") == "1등" and p.get("winners", 0) > 0
               for p in entry.get("prizes", []))

async def main():
    rounds  = read_rounds()
    updated = load_json(DETAIL_JSON)
    backup  = load_json(BACKUP_FILE)

    bv = sum(1 for v in backup.values() if has_valid(v))
    mv = sum(1 for v in updated.values() if has_valid(v))
    if bv > mv:
        print(f"백업 사용 ({bv} > {mv})")
        updated = backup

    need = [r for r in rounds if not has_valid(updated.get(str(r), {}))]
    total = len(need)
    have  = sum(1 for v in updated.values() if has_valid(v))
    print(f"전체: {len(rounds)}회  /  수집 완료: {have}개  /  남은 작업: {total}개")

    if total == 0:
        print("✅ 이미 모두 수집됐습니다.")
        save_json(updated)
        return

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            locale="ko-KR",
        )
        page = await ctx.new_page()

        # 메인 페이지 방문 → 세션/쿠키 초기화
        print("브라우저로 동행복권 접속 중...")
        await page.goto("https://www.dhlottery.co.kr/", wait_until="domcontentloaded", timeout=15000)
        await asyncio.sleep(2)

        # 연결 테스트
        print(f"연결 테스트 ({need[0]}회)...")
        test = await page.evaluate(f"""async () => {{
            const r = await fetch('/common.do?method=getLottoNumber&drwNo={need[0]}', {{
                headers: {{ 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest' }}
            }});
            return await r.text();
        }}""")

        if test.strip().startswith("<"):
            print("[오류] 여전히 HTML 응답. 잠시 후 다시 시도하세요.")
            await browser.close()
            return

        try:
            d = json.loads(test)
            if d.get("returnValue") == "success":
                w = int(d.get("firstPrzwnerCo", 0))
                a = int(d.get("firstWinamnt", 0))
                print(f"연결 성공! ({need[0]}회: 1등 {w}명, {a:,}원)")
                updated[str(need[0])] = {"round": need[0], "prizes": [{"rank":"1등","amount":a,"winners":w}]}
                need = need[1:]
            else:
                print(f"[경고] returnValue: {d.get('returnValue')}")
        except:
            print("[오류] JSON 파싱 실패")
            await browser.close()
            return

        # 배치 수집 (20개씩 병렬)
        BATCH = 20
        done  = 1
        import time
        start = time.time()

        for i in range(0, len(need), BATCH):
            batch = need[i:i+BATCH]
            js_rounds = json.dumps(batch)
            results = await page.evaluate(f"""async () => {{
                const rounds = {js_rounds};
                const results = {{}};
                await Promise.all(rounds.map(async (r) => {{
                    try {{
                        const res = await fetch('/common.do?method=getLottoNumber&drwNo=' + r, {{
                            headers: {{ 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest' }}
                        }});
                        const d = await res.json();
                        if (d.returnValue === 'success') {{
                            results[r] = {{
                                round: r,
                                prizes: [{{ rank: '1등', amount: parseInt(d.firstWinamnt||0), winners: parseInt(d.firstPrzwnerCo||0) }}]
                            }};
                        }}
                    }} catch(e) {{}}
                }}));
                return results;
            }}""")

            for k, v in results.items():
                updated[str(k)] = v
                done += 1

            # 100개마다 저장
            if done % 100 < BATCH:
                save_json(updated)
                elapsed = time.time() - start
                speed = done / elapsed if elapsed > 0 else 1
                remain = (total - done) / speed if speed > 0 else 0
                valid = sum(1 for v in updated.values() if has_valid(v))
                print(f"진행 {done}/{total}  ({speed:.1f}회/s  ~{int(remain)}초 남음)  유효: {valid}개")

            await asyncio.sleep(0.3)

        await browser.close()

    save_json(updated)
    valid_total = sum(1 for v in updated.values() if has_valid(v))
    print(f"\n✅ 완료!")
    print(f"총 유효 데이터: {valid_total}/{len(rounds)}개")
    if valid_total > 0:
        print(f"\n다음 명령어로 git에 반영하세요:")
        print(f'  git add public/lotto_history_details.json')
        print(f'  git commit -m "chore: 당첨정보 수집"')
        print(f'  git push origin main')

if __name__ == "__main__":
    asyncio.run(main())
