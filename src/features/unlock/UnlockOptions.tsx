import {
  Eye,
  EyeOff,
  KeyRound,
} from "lucide-react";

type Props = {
  password: string;
  showPassword: boolean;
  onPasswordChange: (
    password: string
  ) => void;
  onShowPasswordChange: (
    visible: boolean
  ) => void;
};

export default function UnlockOptions({
  password,
  showPassword,
  onPasswordChange,
  onShowPasswordChange,
}: Props) {
  return (
    <div className="mt-8 rounded-2xl border border-slate-700 bg-slate-900 p-6">
      <div className="mb-6 flex items-center gap-3">
        <KeyRound className="h-7 w-7 text-blue-400" />

        <div>
          <h2 className="text-2xl font-bold text-white">
            PDF Password
          </h2>

          <p className="mt-1 text-sm text-slate-400">
            Enter the current password used
            to open the PDF.
          </p>
        </div>
      </div>

      <label className="mb-2 block font-semibold text-white">
        Current Password
      </label>

      <div className="relative">
        <input
          type={
            showPassword
              ? "text"
              : "password"
          }
          value={password}
          autoComplete="current-password"
          placeholder="Enter PDF password"
          onChange={(event) =>
            onPasswordChange(
              event.target.value
            )
          }
          className="w-full rounded-xl border border-slate-700 bg-slate-800 p-3 pr-12 text-white outline-none focus:border-blue-500"
        />

        <button
          type="button"
          onClick={() =>
            onShowPasswordChange(
              !showPassword
            )
          }
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-white"
          aria-label={
            showPassword
              ? "Hide password"
              : "Show password"
          }
        >
          {showPassword ? (
            <EyeOff className="h-5 w-5" />
          ) : (
            <Eye className="h-5 w-5" />
          )}
        </button>
      </div>

      <div className="mt-5 rounded-xl border border-amber-500/20 bg-amber-950/30 p-4 text-sm text-amber-200">
        You must know the correct PDF
        password. Draflio does not bypass or
        recover unknown passwords.
      </div>
    </div>
  );
}