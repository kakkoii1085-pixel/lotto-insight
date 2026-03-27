"""
동행복권 JSON API를 사용하여 1등 당첨자수 / 당첨금액을 수집합니다.
API: https://www.dhlottery.co.kr/common.do?method=getLottoNumber&drwNo={회차}
응답 필드: firstPrzwnerCo (1등 당첨자수), firstWinamnt (1등 당첨금)
"""

import csv
import json
import os
import time
from typing import Dict, List

import requests

CSV_FILE = "public/lotto_numbers.csv"
DETAIL_JSON_FILE = "public/lotto_history_details.json"
API_URL = "https://www.dhlottery.co.kr/common.do?method=getLottoNumber&drwNo={}"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Referer": "https://www.dhlottery.co.kr/",
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
    """JSON API에서 1등 당첨자수·금액 조회"""
    url = API_URL.format(round_no)
    r = requests.get(url, headers=HEADERS, timeout=10)
    r.raise_for_status()
    data = r.json()

    if data.get("returnValue") != "success":
        return {"round": round_no, "prizes": []}

    return {
        "round": round_no,
        "prizes": [
            {
                "rank": "1등",
                "amount": int(data.get("firstWinamnt", 0)),
                "winners": int(data.get("firstPrzwnerCo", 0)),
            }
        ],
    }


def load_existing_json() -> Dict[str, Dict]:
    if not os.path.exists(DETAIL_JSON_FILE):
        return {}
    try:
        with open(DETAIL_JSON_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def has_valid_prize(entry: Dict) -> bool:
    """이미 1등 데이터가 올바르게 저장돼 있으면 True"""
    prizes = entry.get("prizes", [])
    return any(p.get("rank") == "1등" and p.get("winners", 0) > 0 for p in prizes)


def main():
    rounds = read_rounds_from_csv()
    existing = load_existing_json()
    updated: Dict[str, Dict] = dict(existing)

    need_update = [r for r in rounds if not has_valid_prize(updated.get(str(r), {}))]
    print(f"전체 회차: {len(rounds)}  /  업데이트 필요: {len(need_update)}회")

    for round_no in need_update:
        key = str(round_no)
        try:
            detail = fetch_first_prize(round_no)
            updated[key] = detail
            w = detail["prizes"][0]["winners"] if detail["prizes"] else 0
            a = detail["prizes"][0]["amount"] if detail["prizes"] else 0
            print(f"[완료] {round_no}회  1등 {w}명  {a:,}원")
            time.sleep(0.2)
        except Exception as e:
            print(f"[실패] {round_no}회: {e}")

    os.makedirs("public", exist_ok=True)
    with open(DETAIL_JSON_FILE, "w", encoding="utf-8") as f:
        json.dump(updated, f, ensure_ascii=False, indent=2)

    print(f"\n저장 완료: {DETAIL_JSON_FILE}  ({len(updated)}회차)")


if __name__ == "__main__":
    main()
