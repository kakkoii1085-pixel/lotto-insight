import { Navigate, Route, Routes } from "react-router-dom";
import Navbar from "./components/Navbar";
import Analysis from "./pages/Analysis";
import History from "./pages/History";
import Generator from "./pages/Generator";
import HotNumbers from "./pages/HotNumbers";

export default function App() {
  return (
    <div className="app-shell">
      <Navbar />
      <Routes>
        <Route path="/" element={<Navigate to="/analysis" replace />} />
        <Route path="/analysis" element={<Analysis />} />
        <Route path="/history" element={<History />} />
        <Route path="/generator" element={<Generator />} />
        <Route path="/hot-numbers" element={<HotNumbers />} />
      </Routes>
    </div>
  );
}