"""
새 로또 회차를 CSV 파일 맨 위에 추가하는 스크립트
사용법: python scripts/add_round.py <회차> <날짜> <n1> <n2> <n3> <n4> <n5> <n6> <보너스> <당첨자수> <당첨금>
"""
import sys
import os
import json
from datetime import datetime


def upsert_detail_json(base_dir: str, round_no: int, winners: int, amount: int) -> None:
    detail_path = os.path.join(base_dir, "public", "lotto_history_details.json")
    detail_data = {}

    if os.path.exists(detail_path):
        try:
            with open(detail_path, "r", encoding="utf-8") as f:
                loaded = json.load(f)
                if isinstance(loaded, dict):
                    detail_data = loaded
        except Exception:
            detail_data = {}

    detail_data[str(round_no)] = {
        "round": round_no,
        "prizes": [{
            "rank": "1등",
            "amount": amount,
            "winners": winners,
        }],
    }

    with open(detail_path, "w", encoding="utf-8", newline="\n") as f:
        json.dump(detail_data, f, ensure_ascii=False, indent=2)
        f.write("\n")


def parse_int_arg(raw: str, label: str) -> int:
    cleaned = raw.strip().replace(",", "").replace("_", "")
    if not cleaned or not cleaned.lstrip("-").isdigit():
        raise ValueError(f"{label} 값이 숫자가 아닙니다: {raw}")
    return int(cleaned)


def parse_date_arg(raw: str) -> str:
    cleaned = raw.strip()
    try:
        datetime.strptime(cleaned, "%Y-%m-%d")
    except ValueError as exc:
        raise ValueError(f"날짜 형식이 올바르지 않습니다 (YYYY-MM-DD): {raw}") from exc
    return cleaned


def validate_numbers(numbers: list[int], bonus: int) -> None:
    if any(n < 1 or n > 45 for n in numbers):
        raise ValueError("당첨 번호는 1~45 범위여야 합니다.")
    if len(set(numbers)) != 6:
        raise ValueError("당첨 번호 6개는 중복될 수 없습니다.")
    if bonus < 1 or bonus > 45:
        raise ValueError("보너스 번호는 1~45 범위여야 합니다.")
    if bonus in numbers:
        raise ValueError("보너스 번호는 당첨 번호 6개와 중복될 수 없습니다.")


def validate_business_values(round_no: int, winners: int, amount: int) -> None:
    if round_no <= 0:
        raise ValueError("회차는 1 이상의 정수여야 합니다.")
    if winners < 0:
        raise ValueError("1등 당첨자 수는 0 이상이어야 합니다.")
    if amount < 0:
        raise ValueError("1등 당첨금은 0 이상이어야 합니다.")

def main():
    if len(sys.argv) < 12:
        print("인수가 부족합니다.")
        sys.exit(1)

    try:
        round_no = parse_int_arg(sys.argv[1], "회차")
        date = parse_date_arg(sys.argv[2])
        n1, n2, n3, n4, n5, n6 = [parse_int_arg(sys.argv[i], f"{i-2}번째 번호") for i in range(3, 9)]
        bonus = parse_int_arg(sys.argv[9], "보너스 번호")
        winners = parse_int_arg(sys.argv[10], "1등 당첨자 수")
        amount = parse_int_arg(sys.argv[11], "1등 당첨금")
        validate_numbers([n1, n2, n3, n4, n5, n6], bonus)
        validate_business_values(round_no, winners, amount)
    except ValueError as exc:
        print(f"[입력 오류] {exc}")
        sys.exit(1)

    # 번호 정렬 (오름차순)
    numbers = sorted([n1, n2, n3, n4, n5, n6])

    base_dir = os.path.join(os.path.dirname(__file__), "..")
    csv_path     = os.path.join(base_dir, "public", "lotto_numbers.csv")
    csv_path_ext = os.path.join(base_dir, "public", "lotto_numbers.csv.csv")

    # 기존 파일 읽기
    with open(csv_path, "r", encoding="utf-8") as f:
        lines = f.read().splitlines()

    header = lines[0]
    existing = lines[1:]

    # 중복 회차 확인
    for line in existing:
        cols = line.split(",")
        if len(cols) > 1 and cols[1].strip() == str(round_no):
            print(f"[경고] {round_no}회 데이터가 이미 존재합니다. 추가를 건너뜁니다.")
            sys.exit(0)

    # 기존 행은 그대로 유지 (No 컬럼 재번호 매김을 하지 않아 대량 diff 방지)
    updated_existing = [line for line in existing if line.strip()]

    max_no = 0
    for line in updated_existing:
        cols = line.split(",")
        if not cols:
            continue
        try:
            max_no = max(max_no, int(cols[0]))
        except Exception:
            continue

    # 새 행 생성
    new_no = max_no + 1
    new_row = f"{new_no},{round_no},{date},{numbers[0]},{numbers[1]},{numbers[2]},{numbers[3]},{numbers[4]},{numbers[5]},{bonus},1,{winners},{amount}"

    # 파일 다시 쓰기
    new_content = "\n".join([header, new_row] + updated_existing) + "\n"

    with open(csv_path, "w", encoding="utf-8", newline="\n") as f:
        f.write(new_content)

    # .csv.csv 파일도 동일하게 업데이트
    with open(csv_path_ext, "w", encoding="utf-8", newline="\n") as f:
        f.write(new_content)

    upsert_detail_json(base_dir, round_no, winners, amount)

    print(f"✅ {round_no}회 ({date}) 데이터가 추가되었습니다.")
    print(f"   번호: {numbers[0]} {numbers[1]} {numbers[2]} {numbers[3]} {numbers[4]} {numbers[5]} + 보너스 {bonus}")

if __name__ == "__main__":
    main()
