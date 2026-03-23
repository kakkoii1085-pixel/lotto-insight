import { Routes, Route, Navigate } from "react-router-dom";
import Navbar from "./components/Navbar";
import Analysis from "./pages/analysis";
import Generator from "./pages/Generator";
import History from "./pages/History";
import HotNumbers from "./pages/HotNumbers";
import Purchase from "./pages/Purchase";
import "./App.css";

export default function App() {
  return (
    <div className="appShell">
      <Navbar />

      <Routes>
        <Route path="/" element={<Navigate to="/analysis" replace />} />
        <Route path="/analysis" element={<Analysis />} />
        <Route path="/generator" element={<Generator />} />
        <Route path="/hot-numbers" element={<HotNumbers />} />
        <Route path="/purchase" element={<Purchase />} />
        <Route path="/history" element={<History />} />
      </Routes>
    </div>
  );
}