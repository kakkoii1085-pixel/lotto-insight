"""
동행복권 JSON API를 사용하여 1등 당첨자수 / 당첨금액을 수집합니다.
API: https://www.dhlottery.co.kr/common.do?method=getLottoNumber&drwNo={회차}
응답 필드: firstPrzwnerCo (1등 당첨자수), firstWinamnt (1등 당첨금)
병렬 처리(ThreadPoolExecutor)로 빠르게 수집합니다.
"""

import csv
import json
import os
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Dict, List

import requests

CSV_FILE = "public/lotto_numbers.csv"
DETAIL_JSON_FILE = "public/lotto_history_details.json"
API_URL = "https://www.dhlottery.co.kr/common.do?method=getLottoNumber&drwNo={}"
MAX_WORKERS = 20   # 동시 요청 수
SAVE_INTERVAL = 100  # 몇 개 완료마다 중간 저장

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Accept": "application/json, text/javascript, */*; q=0.01",
    "Referer": "https://www.dhlottery.co.kr/gameResult.do?method=byWin",
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
    """JSON API에서 1등 당첨자수·금액 조회 (재시도 포함)"""
    for attempt in range(3):
        try:
            r = requests.get(API_URL.format(round_no), headers=HEADERS, timeout=10)
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
        except Exception as e:
            if attempt < 2:
                time.sleep(1)
            else:
                raise e
    return {"round": round_no, "prizes": []}


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

    done = 0
    failed = 0

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
                    speed = done / elapsed if elapsed > 0 else 0
                    remain = (total - done) / speed if speed > 0 else 0
                    print(f"진행 {done}/{total}  ({speed:.1f}회/s  남은시간 ~{remain:.0f}초)")
                # 중간 저장 (데이터 손실 방지)
                if done % SAVE_INTERVAL == 0:
                    save_json(updated)
                    print(f"  → 중간 저장 완료 ({done}회차)")
            except Exception as e:
                failed += 1
                print(f"[실패] {round_no}회: {e}")

    save_json(updated)
    elapsed = time.time() - start
    print(f"\n완료: {done}개 수집  /  실패: {failed}개  /  소요시간: {elapsed:.1f}초")
    print(f"저장 완료: {DETAIL_JSON_FILE}  ({len(updated)}회차)")


if __name__ == "__main__":
    main()
