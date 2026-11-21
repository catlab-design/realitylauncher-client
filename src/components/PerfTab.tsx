import React from "react";
import { perfProbe } from "../lib/perfProbe";

export function PerfTab({ id, children }: { id: string; children: React.ReactNode }) {
  if (!import.meta.env.DEV) return <>{children}</>;
  return (
    <React.Profiler id={id} onRender={(profilerId, phase, duration) => perfProbe.onRender(profilerId, phase, duration)}>
      {children}
    </React.Profiler>
  );
}
