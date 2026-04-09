"""
새 로또 회차를 CSV 파일 맨 위에 추가하는 스크립트
사용법: python scripts/add_round.py <회차> <날짜> <n1> <n2> <n3> <n4> <n5> <n6> <보너스> <당첨자수> <당첨금>
"""
import sys
import os

def main():
    if len(sys.argv) < 12:
        print("인수가 부족합니다.")
        sys.exit(1)

    round_no  = int(sys.argv[1])
    date      = sys.argv[2]
    n1, n2, n3, n4, n5, n6 = [int(sys.argv[i]) for i in range(3, 9)]
    bonus     = int(sys.argv[9])
    winners   = int(sys.argv[10])
    amount    = int(sys.argv[11])

    # 번호 정렬 (오름차순)
    numbers = sorted([n1, n2, n3, n4, n5, n6])

    csv_path     = os.path.join(os.path.dirname(__file__), "..", "public", "lotto_numbers.csv")
    csv_path_ext = os.path.join(os.path.dirname(__file__), "..", "public", "lotto_numbers.csv.csv")

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

    # No 컬럼: 기존 데이터 No를 +1씩 올리고 새 행은 No=1
    updated_existing = []
    for line in existing:
        if not line.strip():
            continue
        cols = line.split(",")
        try:
            cols[0] = str(int(cols[0]) + 1)
        except:
            pass
        updated_existing.append(",".join(cols))

    # 새 행 생성
    new_row = f"1,{round_no},{date},{numbers[0]},{numbers[1]},{numbers[2]},{numbers[3]},{numbers[4]},{numbers[5]},{bonus},1,{winners},{amount}"

    # 파일 다시 쓰기
    new_content = "\n".join([header, new_row] + updated_existing) + "\n"

    with open(csv_path, "w", encoding="utf-8", newline="\n") as f:
        f.write(new_content)

    # .csv.csv 파일도 동일하게 업데이트
    with open(csv_path_ext, "w", encoding="utf-8", newline="\n") as f:
        f.write(new_content)

    print(f"✅ {round_no}회 ({date}) 데이터가 추가되었습니다.")
    print(f"   번호: {numbers[0]} {numbers[1]} {numbers[2]} {numbers[3]} {numbers[4]} {numbers[5]} + 보너스 {bonus}")

if __name__ == "__main__":
    main()
