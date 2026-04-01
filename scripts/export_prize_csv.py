"""
동행복권 1등 당첨자수/당첨금액을 수집하여 CSV로 저장합니다.
출력 파일: public/lotto_prize_data.csv
업로드 방법: 앱 History 페이지 → "데이터 업데이트" 버튼 → 이 파일 선택

CSV 컬럼: 회차,추첨일,1등당첨자,1등당첨금
"""

import csv
import json
import os
import time

import requests
import urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSV_INPUT   = os.path.join(BASE_DIR, "public", "lotto_numbers.csv")
DETAIL_JSON = os.path.join(BASE_DIR, "public", "lotto_history_details.json")
OUTPUT_CSV  = os.path.join(BASE_DIR, "public", "lotto_prize_data.csv")
BACKUP_FILE = os.path.join(os.path.expanduser("~"), "lotto_prizes_backup.json")

API_URL = "https://www.dhlottery.co.kr/common.do?method=getLottoNumber&drwNo={}"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Accept": "application/json, text/javascript, */*; q=0.01",
    "Accept-Language": "ko-KR,ko;q=0.9",
    "Referer": "https://www.dhlottery.co.kr/gameResult.do?method=byWin",
    "X-Requested-With": "XMLHttpRequest",
}


def read_csv_rows():
    rows = []
    with open(CSV_INPUT, "r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            try:
                rows.append({
                    "round": int(row["회차"]),
                    "date": row["추첨일"],
                })
            except Exception:
                continue
    return sorted(rows, key=lambda r: r["round"])


def load_json_cache():
    cache = {}
    # detail JSON 로드
    for path in [DETAIL_JSON, BACKUP_FILE]:
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
            for k, v in data.items():
                prizes = v.get("prizes", [])
                if any(p.get("rank") == "1등" and p.get("winners", 0) > 0 for p in prizes):
                    cache[int(k)] = {
                        "winners": prizes[0]["winners"],
                        "amount": prizes[0]["amount"],
                    }
        except Exception:
            pass
    return cache


def fetch_prize(round_no):
    for attempt in range(2):
        try:
            r = requests.get(API_URL.format(round_no), headers=HEADERS, timeout=8, verify=False)
            r.raise_for_status()
            d = r.json()
            if d.get("returnValue") != "success":
                return None
            return {
                "winners": int(d.get("firstPrzwnerCo", 0)),
                "amount": int(d.get("firstWinamnt", 0)),
            }
        except requests.exceptions.JSONDecodeError:
            return None
        except Exception as e:
            if attempt == 0:
                time.sleep(2)
            else:
                raise e
    return None


def save_csv(rows_with_prize, output_path):
    with open(output_path, "w", encoding="utf-8-sig", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["회차", "추첨일", "1등당첨자", "1등당첨금"])
        for r in rows_with_prize:
            writer.writerow([r["round"], r["date"], r.get("winners", 0), r.get("amount", 0)])


def main():
    print(f"입력: {CSV_INPUT}")
    print(f"출력: {OUTPUT_CSV}")

    rows = read_csv_rows()
    cache = load_json_cache()

    print(f"\n전체 {len(rows)}회  /  기존 캐시: {len(cache)}개")

    need_fetch = [r for r in rows if r["round"] not in cache]
    total = len(need_fetch)

    if total > 0:
        # 연결 테스트
        print(f"\n수집 필요: {total}개  →  연결 테스트 중...")
        try:
            result = fetch_prize(need_fetch[0]["round"])
            if result is None:
                print("[오류] API가 성공 응답을 주지 않습니다. 나중에 다시 시도하세요.")
                return
            print("연결 성공!")
        except Exception as e:
            print(f"\n[오류] dhlottery.co.kr 연결 실패: {e}")
            print("집 WiFi에서 실행하거나, 핫스팟을 재시작 후 다시 시도하세요.")
            # 캐시 데이터만으로 CSV 저장
            if cache:
                print(f"\n캐시 데이터({len(cache)}개)만으로 CSV 저장...")
                result_rows = []
                for r in rows:
                    prize = cache.get(r["round"], {})
                    result_rows.append({**r, "winners": prize.get("winners", 0), "amount": prize.get("amount", 0)})
                save_csv(result_rows, OUTPUT_CSV)
                print(f"✅ {OUTPUT_CSV} 저장 완료 (유효 데이터: {len(cache)}개)")
            return

        done = 0
        failed = 0
        start = time.time()

        for row in need_fetch:
            try:
                prize = fetch_prize(row["round"])
                if prize and prize["winners"] > 0:
                    cache[row["round"]] = prize
                done += 1
                if done % 50 == 0:
                    elapsed = time.time() - start
                    speed = done / elapsed if elapsed > 0 else 1
                    remain = (total - done) / speed
                    print(f"  진행 {done}/{total}  ({speed:.1f}회/s  ~{int(remain)}초 남음)")
                time.sleep(0.3)
            except Exception:
                failed += 1
                time.sleep(1)

        elapsed = time.time() - start
        print(f"\n수집 완료: {done}개  /  실패: {failed}개  /  소요: {elapsed:.0f}초")
    else:
        print("모든 데이터가 캐시에 있습니다. 즉시 CSV 저장합니다.")

    # CSV 출력
    result_rows = []
    for r in rows:
        prize = cache.get(r["round"], {})
        result_rows.append({**r, "winners": prize.get("winners", 0), "amount": prize.get("amount", 0)})

    save_csv(result_rows, OUTPUT_CSV)
    valid = sum(1 for r in result_rows if r.get("winners", 0) > 0)
    print(f"\n✅ 완료! → {OUTPUT_CSV}")
    print(f"   유효 데이터: {valid}/{len(rows)}회")
    print(f"\n[ 앱 업데이트 방법 ]")
    print(f"  1) 앱 열기 → 히스토리 페이지")
    print(f"  2) '📂 데이터 업데이트' 버튼 클릭")
    print(f"  3) {OUTPUT_CSV} 선택")
    print(f"  → 즉시 당첨자/당첨금 표시!")


if __name__ == "__main__":
    main()
