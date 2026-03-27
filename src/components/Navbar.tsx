import { NavLink } from "react-router-dom";

export default function Navbar() {
  return (
    <header className="li-header">
      <div className="li-header-inner">
        <div className="li-brand-wrap">
          <div className="li-brand-kicker">SMART LOTTO ANALYSIS</div>
          <h1 className="li-brand-title">LOTTO INSIGHT</h1>
          <p className="li-brand-sub">
            분석 · 생성 · 추첨 시뮬레이션 · 구매관리까지 한 번에 보는 로또 인사이트
          </p>
        </div>

        <nav className="li-nav-wrap">
          <NavLink
            to="/analysis"
            className={({ isActive }) =>
              `li-nav-btn ${isActive ? "active" : ""}`
            }
          >
            분석
          </NavLink>

          <NavLink
            to="/generator"
            className={({ isActive }) =>
              `li-nav-btn ${isActive ? "active" : ""}`
            }
          >
            번호생성기
          </NavLink>

          <NavLink
            to="/hot-numbers"
            className={({ isActive }) =>
              `li-nav-btn ${isActive ? "active" : ""}`
            }
          >
            추첨 시뮬레이터
          </NavLink>

          <NavLink
            to="/purchase"
            className={({ isActive }) =>
              `li-nav-btn ${isActive ? "active" : ""}`
            }
          >
            구매메뉴
          </NavLink>

          <NavLink
            to="/history"
            className={({ isActive }) =>
              `li-nav-btn ${isActive ? "active" : ""}`
            }
          >
            역대당첨번호
          </NavLink>

          <NavLink
            to="/ticket-pattern"
            className={({ isActive }) =>
              `li-nav-btn ${isActive ? "active" : ""}`
            }
          >
            용지패턴분석
          </NavLink>

          <NavLink
            to="/annual-pattern"
            className={({ isActive }) =>
              `li-nav-btn ${isActive ? "active" : ""}`
            }
          >
            연간분포패턴
          </NavLink>
        </nav>
      </div>
    </header>
  );
}