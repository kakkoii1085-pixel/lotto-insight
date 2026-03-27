"""
동행복권 JSON API를 사용하여 1등 당첨자수 / 당첨금액을 수집합니다.
API: https://www.dhlottery.co.kr/common.do?method=getLottoNumber&drwNo={회차}
- 순차 처리 (스로틀링 방지)
- 10개마다 즉시 저장 (중단돼도 데이터 보존)
- 백업 파일도 동시 저장
"""

import csv
import json
import os
import time
from typing import Dict, List

import requests
import urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# 스크립트 위치 기준 절대 경로 (어느 디렉토리에서 실행해도 올바른 경로)
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSV_FILE         = os.path.join(BASE_DIR, "public", "lotto_numbers.csv")
DETAIL_JSON_FILE = os.path.join(BASE_DIR, "public", "lotto_history_details.json")
BACKUP_FILE      = os.path.join(os.path.expanduser("~"), "lotto_prizes_backup.json")

API_URL = "https://www.dhlottery.co.kr/common.do?method=getLottoNumber&drwNo={}"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Accept": "application/json, text/javascript, */*; q=0.01",
    "Accept-Language": "ko-KR,ko;q=0.9",
    "Referer": "https://www.dhlottery.co.kr/gameResult.do?method=byWin",
    "X-Requested-With": "XMLHttpRequest",
}


def read_rounds_from_csv() -> List[int]:
    with open(CSV_FILE, "r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        rounds = []
        for row in reader:
            try:
                rounds.append(int(row["회차"]))
            except Exception:
                continue
    return sorted(set(rounds))


def fetch_first_prize(round_no: int) -> Dict:
    for attempt in range(2):
        try:
            r = requests.get(API_URL.format(round_no), headers=HEADERS, timeout=8, verify=False)
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
            if attempt == 0:
                time.sleep(2)
    raise last_err


def load_json(path: str) -> Dict[str, Dict]:
    if not os.path.exists(path):
        return {}
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def save_json(data: Dict[str, Dict]):
    """메인 파일과 백업 파일 동시 저장"""
    os.makedirs(os.path.dirname(DETAIL_JSON_FILE), exist_ok=True)
    # 임시 파일에 먼저 쓴 뒤 rename (원자적 저장)
    tmp = DETAIL_JSON_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    os.replace(tmp, DETAIL_JSON_FILE)
    # 백업도 저장
    with open(BACKUP_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def has_valid_prize(entry: Dict) -> bool:
    prizes = entry.get("prizes", [])
    return any(p.get("rank") == "1등" and p.get("winners", 0) > 0 for p in prizes)


def main():
    start = time.time()
    print(f"저장 경로: {DETAIL_JSON_FILE}")
    print(f"백업 경로: {BACKUP_FILE}")

    rounds  = read_rounds_from_csv()
    updated = load_json(DETAIL_JSON_FILE)

    # 백업 파일에 더 많은 데이터가 있으면 백업 우선 사용
    backup = load_json(BACKUP_FILE)
    backup_valid = sum(1 for v in backup.values() if has_valid_prize(v))
    main_valid   = sum(1 for v in updated.values() if has_valid_prize(v))
    if backup_valid > main_valid:
        print(f"백업 파일이 더 많은 데이터 보유 ({backup_valid} > {main_valid}), 백업 사용")
        updated = backup

    need_update = [r for r in rounds if not has_valid_prize(updated.get(str(r), {}))]
    total = len(need_update)
    valid_now = sum(1 for v in updated.values() if has_valid_prize(v))
    print(f"전체: {len(rounds)}회  /  기존 수집: {valid_now}개  /  남은 작업: {total}개  (순차 처리)")

    if total == 0:
        print("모든 데이터가 최신입니다.")
        save_json(updated)
        return

    # 연결 테스트
    print("연결 테스트 중...")
    try:
        fetch_first_prize(need_update[0])
        print(f"연결 성공!")
    except Exception as e:
        print(f"\n[오류] dhlottery.co.kr 연결 실패: {e}")
        print("잠시 후 다시 시도하거나, 다른 네트워크(핫스팟 등)를 사용해보세요.")
        return

    done = 0
    failed = 0

    for round_no in need_update:
        try:
            detail = fetch_first_prize(round_no)
            updated[str(round_no)] = detail
            done += 1

            # 10개마다 즉시 저장
            if done % 10 == 0:
                save_json(updated)
                elapsed = time.time() - start
                speed = done / elapsed if elapsed > 0 else 1
                remain = (total - done) / speed if speed > 0 else 0
                print(f"진행 {done+valid_now}/{len(rounds)}  ({speed:.1f}회/s  ~{int(remain)}초 남음)  저장완료")

            # 요청 간 딜레이 (스로틀링 방지)
            time.sleep(0.3)

        except Exception as e:
            failed += 1
            updated[str(round_no)] = {"round": round_no, "prizes": []}
            if failed % 10 == 1:
                print(f"[실패] {round_no}회 외 {failed-1}개 실패 중...")
            time.sleep(1)

    save_json(updated)
    elapsed = time.time() - start
    valid_total = sum(1 for v in updated.values() if has_valid_prize(v))
    print(f"\n✅ 완료!")
    print(f"수집: {done}개  /  실패: {failed}개  /  소요시간: {elapsed:.0f}초")
    print(f"총 유효 데이터: {valid_total}/{len(rounds)}개")
    print(f"\n다음 명령어로 git에 반영하세요:")
    print(f'  git add public/lotto_history_details.json')
    print(f'  git commit -m "chore: 당첨정보 수집"')
    print(f'  git push origin main')


if __name__ == "__main__":
    main()
