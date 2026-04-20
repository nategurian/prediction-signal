export function GradientBackground({
  variant = "hero",
  className = "",
}: {
  variant?: "hero" | "muted";
  className?: string;
}) {
  const emeraldOpacity = variant === "hero" ? "opacity-[0.22]" : "opacity-[0.10]";
  const violetOpacity = variant === "hero" ? "opacity-[0.25]" : "opacity-[0.12]";

  return (
    <div aria-hidden className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}>
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, rgba(244,244,245,0.06) 1px, transparent 0)",
          backgroundSize: "32px 32px",
          maskImage:
            "radial-gradient(ellipse 80% 60% at 50% 20%, black 40%, transparent 100%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 80% 60% at 50% 20%, black 40%, transparent 100%)",
        }}
      />
      <div
        className={`absolute -top-40 -left-32 h-[520px] w-[520px] rounded-full bg-emerald-500 blur-[140px] ${emeraldOpacity}`}
      />
      <div
        className={`absolute -bottom-40 -right-24 h-[560px] w-[560px] rounded-full bg-violet-600 blur-[160px] ${violetOpacity}`}
      />
      <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-b from-transparent to-zinc-950" />
    </div>
  );
}
