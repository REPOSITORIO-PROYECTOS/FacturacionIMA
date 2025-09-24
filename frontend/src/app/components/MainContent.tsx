"use client";
import { usePathname } from "next/navigation";

export default function MainContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLoginPage = pathname === "/login" || pathname.startsWith("/login/");
  
  return (
    <main 
      className={`flex-1 bg-white transition-all duration-200 text-black ${
        isLoginPage ? "" : "md:ml-64"
      }`}
    >
      {children}
    </main>
  );
}