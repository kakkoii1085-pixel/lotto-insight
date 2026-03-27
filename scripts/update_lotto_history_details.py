"""
동행복권 JSON API를 사용하여 1등 당첨자수 / 당첨금액을 수집합니다.
API: https://www.dhlottery.co.kr/common.do?method=getLottoNumber&drwNo={회차}
"""

import csv
import json
import os
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Dict, List

import requests
import urllib3

# SSL 인증서 경고 무시 (기업망/VPN 환경 대응)
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

CSV_FILE = "public/lotto_numbers.csv"
DETAIL_JSON_FILE = "public/lotto_history_details.json"

# http:// 와 https:// 둘 다 시도
API_URLS = [
    "https://www.dhlottery.co.kr/common.do?method=getLottoNumber&drwNo={}",
    "http://www.dhlottery.co.kr/common.do?method=getLottoNumber&drwNo={}",
]

MAX_WORKERS = 5    # 동시 요청 수 (너무 높으면 차단됨)
SAVE_INTERVAL = 50

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Accept": "application/json, text/javascript, */*; q=0.01",
    "Accept-Language": "ko-KR,ko;q=0.9",
    "Referer": "https://www.dhlottery.co.kr/gameResult.do?method=byWin",
    "X-Requested-With": "XMLHttpRequest",
}


def read_rounds_from_csv() -> List[int]:
    if not os.path.exists(CSV_FILE):
        raise FileNotFoundError(f"파일이 없습니다: {CSV_FILE}")
    rounds: List[int] = []
    with open(CSV_FILE, "r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            try:
                rounds.append(int(row["회차"]))
            except Exception:
                continue
    return sorted(set(rounds))


def fetch_first_prize(round_no: int) -> Dict:
    """JSON API 호출 (https → http 순서로 재시도, SSL 검증 생략)"""
    last_err = None
    for api_url in API_URLS:
        for attempt in range(2):
            try:
                r = requests.get(
                    api_url.format(round_no),
                    headers=HEADERS,
                    timeout=15,
                    verify=False,   # SSL 인증서 검증 생략
                )
                r.raise_for_status()
                data = r.json()
                if data.get("returnValue") != "success":
                    return {"round": round_no, "prizes": []}
                return {
                    "round": round_no,
                    "prizes": [{
                        "rank": "1등",
                        "amount": int(data.get("firstWinamnt", 0)),
                        "winners": int(data.get("firstPrzwnerCo", 0)),
                    }],
                }
            except requests.exceptions.JSONDecodeError:
                return {"round": round_no, "prizes": []}
            except Exception as e:
                last_err = e
                time.sleep(0.5 * (attempt + 1))
    raise last_err or Exception("모든 URL 시도 실패")


def load_existing_json() -> Dict[str, Dict]:
    if not os.path.exists(DETAIL_JSON_FILE):
        return {}
    try:
        with open(DETAIL_JSON_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def save_json(data: Dict[str, Dict]):
    os.makedirs("public", exist_ok=True)
    with open(DETAIL_JSON_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def has_valid_prize(entry: Dict) -> bool:
    prizes = entry.get("prizes", [])
    return any(p.get("rank") == "1등" and p.get("winners", 0) > 0 for p in prizes)


def main():
    start = time.time()
    rounds = read_rounds_from_csv()
    updated: Dict[str, Dict] = load_existing_json()

    need_update = [r for r in rounds if not has_valid_prize(updated.get(str(r), {}))]
    total = len(need_update)
    print(f"전체 회차: {len(rounds)}  /  업데이트 필요: {total}회  /  동시 요청: {MAX_WORKERS}")

    if total == 0:
        print("모든 데이터가 최신입니다.")
        return

    # 연결 가능 여부 먼저 확인 (1회차로 테스트)
    print("연결 테스트 중...")
    try:
        test = fetch_first_prize(need_update[0])
        print(f"연결 성공! (테스트 회차: {need_update[0]}회)")
    except Exception as e:
        print(f"\n[오류] dhlottery.co.kr 연결 실패: {e}")
        print("브라우저에서 https://www.dhlottery.co.kr 접속이 되는지 확인해주세요.")
        print("VPN을 사용 중이라면 끄고 다시 시도해보세요.")
        return

    done = 0
    failed_rounds = []

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = {executor.submit(fetch_first_prize, r): r for r in need_update}
        for future in as_completed(futures):
            round_no = futures[future]
            try:
                detail = future.result()
                updated[str(round_no)] = detail
                w = detail["prizes"][0]["winners"] if detail["prizes"] else 0
                a = detail["prizes"][0]["amount"]  if detail["prizes"] else 0
                done += 1
                if done % 50 == 0 or done == total:
                    elapsed = time.time() - start
                    speed = done / elapsed if elapsed > 0 else 1
                    remain = (total - done) / speed if speed > 0 else 0
                    print(f"진행 {done}/{total}  ({speed:.1f}회/s  ~{remain:.0f}초 남음)")
                if done % SAVE_INTERVAL == 0:
                    save_json(updated)
            except Exception as e:
                failed_rounds.append(round_no)
                print(f"[실패] {round_no}회: {e}")

    save_json(updated)
    elapsed = time.time() - start
    print(f"\n완료: {done}개 수집  /  실패: {len(failed_rounds)}개  /  소요시간: {elapsed:.1f}초")
    if failed_rounds:
        print(f"실패 회차 목록: {failed_rounds[:20]}{'...' if len(failed_rounds)>20 else ''}")
    print(f"저장 완료: {DETAIL_JSON_FILE}  ({len(updated)}회차)")


if __name__ == "__main__":
    main()
