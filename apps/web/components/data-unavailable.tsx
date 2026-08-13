import { AlertTriangle } from "lucide-react";

export function DataUnavailable({ message }: { message: string }) {
  return (
    <div className="notice notice-error data-unavailable" role="alert">
      <AlertTriangle size={17} aria-hidden="true" />
      <div><strong>Live data is temporarily unavailable.</strong><span>{message}</span></div>
    </div>
  );
}
