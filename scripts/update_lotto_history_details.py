"""
동행복권 당첨정보 수집 스크립트 (세션 방식)
- 실제 브라우저처럼 사이트 방문 후 세션 쿠키로 API 호출
- 10개마다 즉시 저장 (중단돼도 데이터 보존)
"""

import csv
import json
import os
import time
from typing import Dict, List

import requests
import urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSV_FILE         = os.path.join(BASE_DIR, "public", "lotto_numbers.csv")
DETAIL_JSON_FILE = os.path.join(BASE_DIR, "public", "lotto_history_details.json")
BACKUP_FILE      = os.path.join(os.path.expanduser("~"), "lotto_prizes_backup.json")

MAIN_URL = "https://www.dhlottery.co.kr/gameResult.do?method=byWin"
API_URL  = "https://www.dhlottery.co.kr/common.do?method=getLottoNumber&drwNo={}"


def make_session() -> requests.Session:
    """실제 브라우저처럼 세션을 만들어 쿠키를 얻습니다."""
    s = requests.Session()
    s.verify = False
    s.headers.update({
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
        "Accept-Encoding": "gzip, deflate, br",
        "Connection": "keep-alive",
    })
    # 메인 페이지 방문 → 세션 쿠키 획득
    s.get(MAIN_URL, timeout=10)
    time.sleep(1)
    return s


def fetch_prize(session: requests.Session, round_no: int) -> Dict:
    url = API_URL.format(round_no)
    headers = {
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "Referer": MAIN_URL,
        "X-Requested-With": "XMLHttpRequest",
    }
    for attempt in range(3):
        try:
            r = session.get(url, headers=headers, timeout=10)
            # HTML이 반환되면 세션 만료 → 재시도
            if r.text.strip().startswith("<"):
                raise ValueError(f"{round_no}회: HTML 응답 (봇 감지됨), 세션 갱신 필요")
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
        except ValueError as e:
            print(f"\n  [세션 갱신] {e}")
            time.sleep(3)
            session.get(MAIN_URL, timeout=10)  # 세션 재갱신
            time.sleep(2)
        except Exception as e:
            if attempt < 2:
                time.sleep(2)
            else:
                raise
    return {"round": round_no, "prizes": []}


def read_rounds() -> List[int]:
    with open(CSV_FILE, "r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        return sorted(set(int(r["회차"]) for r in reader if r.get("회차", "").isdigit()))


def load_json(path: str) -> Dict:
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def save_json(data: Dict):
    os.makedirs(os.path.dirname(DETAIL_JSON_FILE), exist_ok=True)
    tmp = DETAIL_JSON_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    os.replace(tmp, DETAIL_JSON_FILE)
    with open(BACKUP_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def has_valid_prize(entry: Dict) -> bool:
    return any(p.get("rank") == "1등" and p.get("winners", 0) > 0
               for p in entry.get("prizes", []))


def main():
    print(f"저장 경로: {DETAIL_JSON_FILE}")
    print(f"백업 경로: {BACKUP_FILE}")

    rounds  = read_rounds()
    updated = load_json(DETAIL_JSON_FILE)
    backup  = load_json(BACKUP_FILE)

    # 백업이 더 많으면 우선 사용
    bv = sum(1 for v in backup.values() if has_valid_prize(v))
    mv = sum(1 for v in updated.values() if has_valid_prize(v))
    if bv > mv:
        print(f"백업 파일이 더 많은 데이터 보유 ({bv} > {mv}), 백업 사용")
        updated = backup

    need = [r for r in rounds if not has_valid_prize(updated.get(str(r), {}))]
    total = len(need)
    valid_now = sum(1 for v in updated.values() if has_valid_prize(v))
    print(f"전체: {len(rounds)}회  /  기존 수집: {valid_now}개  /  남은 작업: {total}개")

    if total == 0:
        print("✅ 모든 데이터가 최신입니다.")
        save_json(updated)
        return

    # 세션 시작 (브라우저처럼 쿠키 획득)
    print("\n브라우저 세션 시작 중...")
    session = make_session()

    # 연결 테스트 (실제 데이터 검증)
    print("연결 테스트 중...")
    try:
        test = fetch_prize(session, need[0])
        if not test.get("prizes"):
            print(f"[오류] {need[0]}회 API가 비어있습니다. 잠시 후 재시도하세요.")
            return
        w = test["prizes"][0]["winners"]
        a = test["prizes"][0]["amount"]
        print(f"연결 성공! ({need[0]}회: 1등 {w}명, {a:,}원)")
        updated[str(need[0])] = test
        need = need[1:]
    except Exception as e:
        print(f"\n[오류] 연결 실패: {e}")
        return

    done = 1
    failed = 0
    start = time.time()
    SESSION_REFRESH = 200  # 200개마다 세션 갱신

    for i, round_no in enumerate(need):
        # 200개마다 세션 자동 갱신
        if i > 0 and i % SESSION_REFRESH == 0:
            print(f"\n  [세션 갱신 중... ({i}/{total})]")
            session = make_session()

        try:
            detail = fetch_prize(session, round_no)
            updated[str(round_no)] = detail
            done += 1

            if done % 10 == 0:
                save_json(updated)
                elapsed = time.time() - start
                speed = done / elapsed if elapsed > 0 else 1
                remain = (total - done) / speed if speed > 0 else 0
                valid = sum(1 for v in updated.values() if has_valid_prize(v))
                print(f"진행 {done+valid_now}/{len(rounds)}  "
                      f"({speed:.1f}회/s  ~{int(remain)}초 남음)  "
                      f"유효: {valid}개")

            time.sleep(0.3)

        except Exception as e:
            failed += 1
            updated[str(round_no)] = {"round": round_no, "prizes": []}
            if failed % 10 == 1:
                print(f"[실패] {round_no}회 포함 {failed}개 실패")
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
