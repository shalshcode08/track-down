import React from "react";
import { TopNav } from "./TopNav";
import { T } from "@/lib/theme";

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: T.bg, minHeight: "100vh", fontFamily: T.font }}>
      <TopNav />
      {children}
    </div>
  );
}
