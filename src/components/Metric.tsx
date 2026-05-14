import { Check } from "lucide-react";

interface MetricProps {
  label: string;
  value: string;
  compact?: boolean;
  tooltip?: string;
}

export function Metric({ label, value, compact = false, tooltip }: MetricProps) {
  return (
    <div className={compact ? "metric compact" : "metric"}>
      <span>{label}</span>
      <strong title={tooltip}>{value}</strong>
    </div>
  );
}
