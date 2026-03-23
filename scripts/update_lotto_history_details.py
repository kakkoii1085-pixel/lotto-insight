import csv
import json
import os
import re
import time
from typing import Dict, List

import requests

CSV_FILE = "public/lotto_numbers.csv"
DETAIL_JSON_FILE = "public/lotto_history_details.json"
DETAIL_URL = "https://www.dhlottery.co.kr/gameResult.do?method=byWin&drwNo={}"

HEADERS = {
    "User-Agent": "Mozilla/5.0",
    "Referer": "https://www.dhlottery.co.kr/",
}

RANK_LABELS = ["1등", "2등", "3등", "4등", "5등"]


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


def clean_amount(text: str) -> int:
    nums = re.sub(r"[^0-9]", "", text)
    return int(nums) if nums else 0


def extract_prize_rows(html: str) -> List[Dict]:
    """
    회차 상세 페이지의 순위표에서
    순위 / 총당첨금 / 당첨게임수 를 추출
    """
    rows: List[Dict] = []

    # 표 내부 tr을 넉넉하게 잡음
    tr_blocks = re.findall(r"<tr>(.*?)</tr>", html, re.DOTALL | re.IGNORECASE)

    for block in tr_blocks:
        # 태그 제거용 원본 텍스트
        text_only = re.sub(r"<[^>]+>", " ", block)
        text_only = re.sub(r"\s+", " ", text_only).strip()

        matched_rank = None
        for rank in RANK_LABELS:
            if rank in text_only:
                matched_rank = rank
                break

        if not matched_rank:
            continue

        # 숫자 추출: 금액 / 당첨게임수
        # 보통 "1등 25,354,253,628원 12" 같이 나옴
        numbers = re.findall(r"[\d,]+", text_only)
        if len(numbers) < 2:
            continue

        amount = clean_amount(numbers[0])
        winners = clean_amount(numbers[1])

        rows.append({
            "rank": matched_rank,
            "amount": amount,
            "winners": winners,
        })

    # 1등~5등 순으로 정렬
    rows.sort(key=lambda x: RANK_LABELS.index(x["rank"]))
    return rows[:5]


def fetch_round_detail(round_no: int) -> Dict:
    url = DETAIL_URL.format(round_no)
    res = requests.get(url, headers=HEADERS, timeout=15)
    res.raise_for_status()
    html = res.text

    prize_rows = extract_prize_rows(html)

    return {
        "round": round_no,
        "prizes": prize_rows,
    }


def load_existing_json() -> Dict[str, Dict]:
    if not os.path.exists(DETAIL_JSON_FILE):
        return {}
    try:
        with open(DETAIL_JSON_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def main():
    rounds = read_rounds_from_csv()
    existing = load_existing_json()

    updated: Dict[str, Dict] = dict(existing)

    for round_no in rounds:
        key = str(round_no)

        # 이미 있고 5개 순위가 다 있으면 스킵
        if key in updated and len(updated[key].get("prizes", [])) >= 5:
            print(f"[스킵] {round_no}회")
            continue

        try:
            detail = fetch_round_detail(round_no)
            updated[key] = detail
            print(f"[완료] {round_no}회")
            time.sleep(0.25)
        except Exception as e:
            print(f"[실패] {round_no}회: {e}")

    os.makedirs("public", exist_ok=True)
    with open(DETAIL_JSON_FILE, "w", encoding="utf-8") as f:
        json.dump(updated, f, ensure_ascii=False, indent=2)

    print(f"\n저장 완료: {DETAIL_JSON_FILE}")


if __name__ == "__main__":
    main()