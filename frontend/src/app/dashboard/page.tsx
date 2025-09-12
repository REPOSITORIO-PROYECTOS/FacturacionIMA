"use client";
import React from "react";

export default function DashboardPage() {
  return (
    <div className="flex min-h-screen bg-gray-100">
      <aside className="w-64 bg-white shadow-md">
        <div className="p-6 font-bold text-purple-700 text-2xl">AdminPanel</div>
        <nav className="mt-8">
          <a href="#" className="block py-3 px-6 text-gray-700 hover:bg-purple-100">Dashboard</a>
          <a href="#" className="block py-3 px-6 text-gray-700 hover:bg-purple-100">Users</a>
          <a href="#" className="block py-3 px-6 text-gray-700 hover:bg-purple-100">Analytics</a>
          <a href="#" className="block py-3 px-6 text-gray-700 hover:bg-purple-100">Settings</a>
        </nav>
      </aside>

      <div className="flex-1 flex flex-col">
        <header className="bg-white shadow-md p-4 flex justify-between items-center">
          <h1 className="text-xl font-bold text-purple-700">Dashboard</h1>
          <div className="flex items-center gap-4">
            <input type="text" placeholder="Search..." className="px-4 py-2 border rounded-lg" />
            <div className="w-10 h-10 rounded-full bg-purple-500 flex items-center justify-center text-white font-bold">SR</div>
          </div>
        </header>

        <main className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="bg-white p-6 rounded-lg shadow-md">
              <p className="text-sm text-gray-500">Total Users</p>
              <h2 className="text-3xl font-bold text-purple-700 mt-2">1,240</h2>
            </div>
            <div className="bg-white p-6 rounded-lg shadow-md">
              <p className="text-sm text-gray-500">Revenue</p>
              <h2 className="text-3xl font-bold text-green-600 mt-2">$24,500</h2>
            </div>
            <div className="bg-white p-6 rounded-lg shadow-md">
              <p className="text-sm text-gray-500">New Orders</p>
              <h2 className="text-3xl font-bold text-blue-600 mt-2">320</h2>
            </div>
            <div className="bg-white p-6 rounded-lg shadow-md">
              <p className="text-sm text-gray-500">Pending Tickets</p>
              <h2 className="text-3xl font-bold text-red-500 mt-2">12</h2>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-md">
            <div className="p-4 border-b font-bold text-purple-700">User List</div>
            <table className="w-full text-left">
              <thead className="bg-purple-50">
                <tr>
                  <th className="p-4">Name</th>
                  <th className="p-4">Email</th>
                  <th className="p-4">Role</th>
                  <th className="p-4">Status</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t">
                  <td className="p-4">John Doe</td>
                  <td className="p-4">john@example.com</td>
                  <td className="p-4">Admin</td>
                  <td className="p-4 text-green-600 font-bold">Active</td>
                </tr>
                <tr className="border-t">
                  <td className="p-4">Jane Smith</td>
                  <td className="p-4">jane@example.com</td>
                  <td className="p-4">Editor</td>
                  <td className="p-4 text-yellow-500 font-bold">Pending</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-md grid grid-cols-2 md:grid-cols-4 gap-4">
            <button className="bg-purple-600 text-white py-3 rounded-lg shadow hover:bg-purple-700">Add User</button>
            <button className="bg-blue-600 text-white py-3 rounded-lg shadow hover:bg-blue-700">Export Data</button>
            <button className="bg-green-600 text-white py-3 rounded-lg shadow hover:bg-green-700">Generate Report</button>
            <button className="bg-red-600 text-white py-3 rounded-lg shadow hover:bg-red-700">Delete Records</button>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-md flex items-center gap-6">
            <img src="https://i.pravatar.cc/100" alt="Profile" className="w-20 h-20 rounded-full shadow" />
            <div>
              <h3 className="text-xl font-bold text-purple-700">Sophia Ray</h3>
              <p className="text-gray-500">Administrator</p>
              <button className="mt-2 bg-purple-600 text-white px-4 py-2 rounded-lg shadow hover:bg-purple-700">Edit Profile</button>
            </div>
          </div>

          <footer className="bg-white p-4 mt-10 text-center text-sm text-gray-400 border-t">
            © 2025 AdminPanel. All rights reserved.
          </footer>
        </main>
      </div>
    </div>
  );
}
