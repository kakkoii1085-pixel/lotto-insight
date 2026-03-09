import { Link } from "react-router-dom";

export default function Home() {
  return (
    <div className="container">
      <div className="card">
        <h1 className="page-title">로또 분석 사이트</h1>
        <p className="page-desc">로또 번호 통계와 분석 정보를 제공합니다.</p>

        <div className="home-links">
          <Link to="/generator" className="home-link-btn">
            번호 생성기
          </Link>
          <Link to="/hot-numbers" className="home-link-btn">
            자주 나온 번호 TOP20
          </Link>
        </div>
      </div>
    </div>
  );
}