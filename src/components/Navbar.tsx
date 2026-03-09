import { NavLink } from "react-router-dom";

export default function Navbar() {
  return (
    <div className="navWrap">
      <NavLink
        to="/analysis"
        className={({ isActive }) => `navBtn ${isActive ? "active" : ""}`}
      >
        분석
      </NavLink>

      <NavLink
        to="/history"
        className={({ isActive }) => `navBtn ${isActive ? "active" : ""}`}
      >
        역대 당첨번호
      </NavLink>

      <NavLink
        to="/generator"
        className={({ isActive }) => `navBtn ${isActive ? "active" : ""}`}
      >
        번호 생성기
      </NavLink>

      <NavLink
        to="/hot-numbers"
        className={({ isActive }) => `navBtn ${isActive ? "active" : ""}`}
      >
        자주 나온 번호
      </NavLink>
    </div>
  );
}