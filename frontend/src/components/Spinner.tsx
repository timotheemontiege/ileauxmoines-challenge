export default function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 text-slate-400">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-600 border-t-ocean-400" />
      {label && <span className="text-sm">{label}</span>}
    </div>
  );
}
