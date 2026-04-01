import React from "react";
import { TopNav } from "./TopNav";
import { T } from "@/lib/theme";

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      background: T.bg,
      backgroundImage: 'radial-gradient(ellipse 90% 40% at 50% 0%, rgba(99, 102, 241, 0.07) 0%, transparent 100%)',
      minHeight: "100vh",
      fontFamily: T.font,
    }}>
      <TopNav />
      {children}
    </div>
  );
}
