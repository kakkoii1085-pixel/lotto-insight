import { Navigate, Route, Routes } from "react-router-dom";
import Navbar from "./components/Navbar";
<<<<<<< HEAD
import Analysis from "./pages/Analysis";
import History from "./pages/History";
import Generator from "./pages/Generator";
import HotNumbers from "./pages/HotNumbers";

export default function App() {
  return (
    <div className="app-shell">
      <Navbar />
=======
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

>>>>>>> 54a9a93b722b6dc5ac496a8cb897298b7a2890bb
      <Routes>
        <Route path="/" element={<Navigate to="/analysis" replace />} />
        <Route path="/analysis" element={<Analysis />} />
        <Route path="/history" element={<History />} />
        <Route path="/generator" element={<Generator />} />
<<<<<<< HEAD
        <Route path="/hot-numbers" element={<HotNumbers />} />
      </Routes>
    </div>
  );
}
=======
      </Routes>
    </div>
  );
}

export default App;
>>>>>>> 54a9a93b722b6dc5ac496a8cb897298b7a2890bb
