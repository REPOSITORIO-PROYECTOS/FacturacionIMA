"use client";

import Navbar from "./components/Navbar";
import DashboardPage from "./dashboard/page";

export default function Home() {
  return (
    <div className="flex">
      <Navbar />
      <main className="flex-1 md:ml-64">
        <DashboardPage />
      </main>
    </div>
  );
}