import { Navigate, Route, Routes } from "react-router-dom";
import Navbar from "./components/Navbar";
import History from "./pages/History";
import Analysis from "./pages/Analysis";
import Generator from "./pages/Generator";
import "./App.css";

function App() {
  return (
    <div className="appShell">
      <div className="heroWrap">
        <div className="heroInner">
          <h1 className="appTitle">로또 분석 앱</h1>
          <p className="appSubTitle">역대 데이터 기반 분석 도구</p>
          <Navbar />
        </div>
      </div>

      <Routes>
        <Route path="/" element={<Navigate to="/analysis" replace />} />
        <Route path="/analysis" element={<Analysis />} />
        <Route path="/history" element={<History />} />
        <Route path="/generator" element={<Generator />} />
      </Routes>
    </div>
  );
}

export default App;