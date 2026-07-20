import type { ReactNode } from "react";
import { CircleDashed } from "lucide-react";
export function EmptyState({ title, copy, action }: { title: string; copy: string; action?: ReactNode }) {
  return <div className="empty-state"><span className="empty-icon"><CircleDashed size={22} /></span><strong>{title}</strong><p>{copy}</p>{action}</div>;
}
