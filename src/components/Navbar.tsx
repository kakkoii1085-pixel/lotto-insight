import { NavLink } from "react-router-dom";

function Navbar() {
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
    </div>
  );
}

export default Navbar;