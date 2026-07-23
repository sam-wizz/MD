import { passwordStrength } from "@/lib/auth-validation";
import { cn } from "@/lib/utils";

export function PasswordStrengthMeter({ password }: { password: string }) {
  const { score, label } = passwordStrength(password);
  const pct = (score / 4) * 100;
  const color =
    score <= 1 ? "bg-red-500" : score === 2 ? "bg-amber-500" : score === 3 ? "bg-lime-500" : "bg-emerald-500";

  return (
    <div className="space-y-1.5" aria-live="polite">
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-white/10"
        role="meter"
        aria-label="قوة كلمة المرور"
        aria-valuemin={0}
        aria-valuemax={4}
        aria-valuenow={score}
        aria-valuetext={label}
      >
        <div
          className={cn("h-full transition-all duration-300", color)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-[11px] text-white/45">
        قوة كلمة المرور: <span className="font-bold text-white/70">{password ? label : "—"}</span>
      </p>
    </div>
  );
}
