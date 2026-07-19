export function DataUnavailable({ message }: { message: string }) {
  return (
    <div className="notice notice-error">
      <strong>GridFlow could not load live data.</strong><br />
      {message}
    </div>
  );
}
