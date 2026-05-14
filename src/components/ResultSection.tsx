import { Search } from "lucide-react";
import type { ReactNode } from "react";
import { Panel } from "./Panel";

interface ResultSectionProps {
  title: string;
  children: ReactNode;
}

export function ResultSection({ title, children }: ResultSectionProps) {
  return (
    <Panel title={title} icon={<Search size={18} />}>
      <div className="result-list">{children || <p className="muted">沒有匹配結果。</p>}</div>
    </Panel>
  );
}
