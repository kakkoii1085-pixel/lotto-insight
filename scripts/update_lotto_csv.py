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

    # 헤더만 있는 경우
    if len(rows) <= 1:
        return 0

    last_row = rows[-1]

    try:
        return int(last_row[0])
    except Exception:
        return 0


def fetch_draw(drwno: int):
    url = API.format(drwno)

    try:
        r = requests.get(url, headers=HEADERS, timeout=15)

        content_type = r.headers.get("Content-Type", "")
        text_preview = r.text[:120].replace("\n", " ")

        if "json" not in content_type.lower():
            print(f"[스킵] {drwno}회: JSON 응답 아님")
            print(f"       Content-Type: {content_type}")
            print(f"       응답 앞부분: {text_preview}")
            return None

        data = r.json()

        if data.get("returnValue") != "success":
            print(f"[스킵] {drwno}회: success 아님")
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

    except Exception as e:
        print(f"[에러] {drwno}회 조회 실패: {e}")
        return None


def append_rows(rows):
    if not rows:
        return

    with open(FILE, "a", encoding="utf-8-sig", newline="") as f:
        writer = csv.writer(f)
        writer.writerows(rows)


def main():
    last_draw = get_last_draw_no()
    print(f"현재 마지막 회차: {last_draw}")

    new_rows = []

    # 다음 회차부터 최대 3회까지 시도
    # 보통은 1회만 추가되지만, 누락 대비용
    for drwno in range(last_draw + 1, last_draw + 4):
        row = fetch_draw(drwno)

        if row is None:
            break

        new_rows.append(row)
        print(f"[추가 성공] {drwno}회")

    if not new_rows:
        print("업데이트 없음")
        return

    append_rows(new_rows)
    print(f"업데이트 완료: {len(new_rows)}개 추가")


if __name__ == "__main__":
    main()