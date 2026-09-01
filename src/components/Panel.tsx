import type { ReactNode } from "react";

interface PanelProps {
  title: ReactNode;
  icon: ReactNode;
  children: ReactNode;
}

export function Panel({ title, icon, children }: PanelProps) {
  return (
    <section className="panel">
      <div className="panel-title">
        {icon}
        <h2>{title}</h2>
      </div>
      {children}
    </section>
  );
}
