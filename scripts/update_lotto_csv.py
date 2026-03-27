"""
동행복권 JSON API에서 새 회차 번호를 가져와 CSV에 추가합니다.
새 회차 추가 시 1등 당첨자수/당첨금도 lotto_history_details.json에 동시 저장합니다.
"""

import csv
import json
import os
import requests

API = "https://www.dhlottery.co.kr/common.do?method=getLottoNumber&drwNo={}"
CSV_FILE = "public/lotto_numbers.csv"
DETAIL_JSON_FILE = "public/lotto_history_details.json"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Referer": "https://www.dhlottery.co.kr/",
}


def ensure_file_exists():
    if not os.path.exists(CSV_FILE):
        os.makedirs("public", exist_ok=True)
        with open(CSV_FILE, "w", encoding="utf-8-sig", newline="") as f:
            writer = csv.writer(f)
            writer.writerow([
                "회차", "추첨일",
                "첫번째", "두번째", "세번째",
                "네번째", "다섯번째", "여섯번째",
                "보너스",
            ])


def get_last_draw_no():
    ensure_file_exists()
    with open(CSV_FILE, "r", encoding="utf-8-sig", newline="") as f:
        rows = list(csv.reader(f))
    if len(rows) <= 1:
        return 0
    try:
        return int(rows[-1][0])
    except Exception:
        return 0


def load_detail_json():
    if not os.path.exists(DETAIL_JSON_FILE):
        return {}
    try:
        with open(DETAIL_JSON_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def save_detail_json(data: dict):
    os.makedirs("public", exist_ok=True)
    with open(DETAIL_JSON_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def fetch_draw(drwno):
    """회차 정보를 API에서 가져옵니다. (CSV행 + 1등 상세)"""
    url = API.format(drwno)
    try:
        r = requests.get(url, headers=HEADERS, timeout=10)
        r.raise_for_status()
    except requests.RequestException as e:
        print(f"[오류] {drwno}회 요청 실패: {e}")
        return None, None

    try:
        data = r.json()
    except ValueError:
        print(f"[중단] {drwno}회: JSON 응답이 아닙니다.")
        return None, None

    if data.get("returnValue") != "success":
        print(f"[중단] {drwno}회: 아직 발표되지 않았습니다.")
        return None, None

    csv_row = [
        data["drwNo"],
        data["drwNoDate"],
        data["drwtNo1"],
        data["drwtNo2"],
        data["drwtNo3"],
        data["drwtNo4"],
        data["drwtNo5"],
        data["drwtNo6"],
        data["bnusNo"],
    ]

    detail = {
        "round": int(data["drwNo"]),
        "prizes": [
            {
                "rank": "1등",
                "amount": int(data.get("firstWinamnt", 0)),
                "winners": int(data.get("firstPrzwnerCo", 0)),
            }
        ],
    }

    return csv_row, detail


def append_csv_rows(rows_to_add):
    if not rows_to_add:
        return
    with open(CSV_FILE, "a", encoding="utf-8-sig", newline="") as f:
        writer = csv.writer(f)
        writer.writerows(rows_to_add)


def main():
    last_draw = get_last_draw_no()
    print(f"현재 마지막 회차: {last_draw}")

    detail_data = load_detail_json()
    new_csv_rows = []
    next_draw = last_draw + 1

    while True:
        csv_row, detail = fetch_draw(next_draw)
        if csv_row is None:
            break

        new_csv_rows.append(csv_row)
        detail_data[str(next_draw)] = detail
        w = detail["prizes"][0]["winners"]
        a = detail["prizes"][0]["amount"]
        print(f"[추가] {next_draw}회  1등 {w}명  {a:,}원")
        next_draw += 1

    append_csv_rows(new_csv_rows)

    if new_csv_rows:
        save_detail_json(detail_data)
        print(f"업데이트 완료: {len(new_csv_rows)}개 회차 추가, prize 데이터 저장")
    else:
        print("업데이트 없음 (현재 최신 상태)")


if __name__ == "__main__":
    main()
