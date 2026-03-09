import csv
import os
import requests

API = "https://www.dhlottery.co.kr/common.do?method=getLottoNumber&drwNo={}"
FILE = "public/lotto_numbers.csv"

HEADERS = {
    "User-Agent": "Mozilla/5.0",
    "Referer": "https://www.dhlottery.co.kr/",
}

def ensure_file_exists():
    if not os.path.exists(FILE):
        os.makedirs("public", exist_ok=True)
        with open(FILE, "w", encoding="utf-8-sig", newline="") as f:
            writer = csv.writer(f)
            writer.writerow([
                "회차",
                "추첨일",
                "첫번째",
                "두번째",
                "세번째",
                "네번째",
                "다섯번째",
                "여섯번째",
                "보너스",
            ])

def get_last_draw_no():
    ensure_file_exists()

    with open(FILE, "r", encoding="utf-8-sig", newline="") as f:
        rows = list(csv.reader(f))

    if len(rows) <= 1:
        return 0

    try:
        return int(rows[-1][0])
    except:
        return 0

def fetch_draw(drwno):
    url = API.format(drwno)

    try:
        r = requests.get(url, headers=HEADERS, timeout=10)
        r.raise_for_status()
    except requests.RequestException as e:
        print(f"[오류] {drwno}회 요청 실패: {e}")
        return None

    content_type = r.headers.get("Content-Type", "")

    try:
        data = r.json()
    except ValueError:
        print(f"[중단] {drwno}회: 아직 발표 전이거나 JSON 응답이 아닙니다.")
        print(f"       Content-Type: {content_type}")
        return None

    if data.get("returnValue") != "success":
        print(f"[중단] {drwno}회: 아직 발표되지 않았습니다.")
        return None

    return [
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

def append_rows(rows_to_add):
    if not rows_to_add:
        return

    with open(FILE, "a", encoding="utf-8-sig", newline="") as f:
        writer = csv.writer(f)
        writer.writerows(rows_to_add)

def main():
    last_draw = get_last_draw_no()
    print(f"현재 마지막 회차: {last_draw}")

    new_rows = []
    next_draw = last_draw + 1

    while True:
        row = fetch_draw(next_draw)
        if row is None:
            break

        print(f"[추가] {next_draw}회")
        new_rows.append(row)
        next_draw += 1

    append_rows(new_rows)

    if new_rows:
        print(f"업데이트 완료: {len(new_rows)}개 회차 추가")
    else:
        print("업데이트 없음 (현재 최신 상태)")

if __name__ == "__main__":
    main()