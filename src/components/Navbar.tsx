import { useState } from "react";
import { NavLink } from "react-router-dom";

export default function Navbar() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const allNavItems = [
    { path: "/analysis", label: "분석", icon: "📊" },
    { path: "/generator", label: "번호생성기", icon: "🎰" },
    { path: "/hot-numbers", label: "추첨 시뮬레이터", icon: "🎲" },
    { path: "/purchase", label: "구매메뉴", icon: "🛒" },
    { path: "/history", label: "역대당첨번호", icon: "📋" },
    { path: "/ticket-pattern", label: "용지패턴분석", icon: "🎫" },
    { path: "/annual-pattern", label: "연간분포패턴", icon: "📈" },
  ];

  const bottomTabItems = [
    { path: "/analysis", label: "분석", icon: "📊" },
    { path: "/generator", label: "번호생성기", icon: "🎰" },
    { path: "/purchase", label: "구매메뉴", icon: "🛒" },
    { path: "/history", label: "역대당첨번호", icon: "📋" },
  ];

  const handleNavClick = () => {
    setIsMenuOpen(false);
  };

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  return (
    <>
      {/* Desktop Header */}
      <header className="li-header li-header-desktop">
        <div className="li-header-inner">
          <div className="li-brand-wrap">
            <div className="li-brand-kicker">SMART LOTTO ANALYSIS</div>
            <h1 className="li-brand-title">LOTTO INSIGHT</h1>
            <p className="li-brand-sub">
              분석 · 생성 · 추첨 시뮬레이션 · 구매관리까지 한 번에 보는 로또 인사이트
            </p>
          </div>

          <nav className="li-nav-wrap">
            {allNavItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  `li-nav-btn ${isActive ? "active" : ""}`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      {/* Mobile Header */}
      <header className="li-header li-mobile-header">
        <div className="li-mobile-header-inner">
          <h1 className="li-mobile-title">LOTTO INSIGHT</h1>
          <button
            className={`li-hamburger-btn ${isMenuOpen ? "open" : ""}`}
            onClick={toggleMenu}
            aria-label="메뉴 열기/닫기"
          >
            <span className="li-hamburger-line"></span>
            <span className="li-hamburger-line"></span>
            <span className="li-hamburger-line"></span>
          </button>
        </div>

        {/* Mobile Dropdown Menu */}
        {isMenuOpen && (
          <nav className="li-mobile-dropdown">
            {allNavItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  `li-mobile-nav-item ${isActive ? "active" : ""}`
                }
                onClick={handleNavClick}
              >
                <span className="li-mobile-nav-icon">{item.icon}</span>
                <span className="li-mobile-nav-label">{item.label}</span>
              </NavLink>
            ))}
          </nav>
        )}
      </header>

      {/* Mobile Bottom Tab Bar */}
      <div className="li-bottom-tabs">
        {bottomTabItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `li-bottom-tab ${isActive ? "active" : ""}`
            }
          >
            <span className="li-bottom-tab-icon">{item.icon}</span>
            <span className="li-bottom-tab-label">{item.label}</span>
          </NavLink>
        ))}
        <button
          className="li-bottom-tab li-bottom-tab-more"
          onClick={toggleMenu}
          aria-label="더보기"
        >
          <span className="li-bottom-tab-icon">≡</span>
          <span className="li-bottom-tab-label">더보기</span>
        </button>
      </div>
    </>
  );
}
