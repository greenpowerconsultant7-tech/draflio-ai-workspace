import {
  Eye,
  EyeOff,
  LockKeyhole,
} from "lucide-react";

type Props = {
  password: string;
  confirmPassword: string;
  showPassword: boolean;

  onPasswordChange: (
    password: string
  ) => void;

  onConfirmPasswordChange: (
    password: string
  ) => void;

  onShowPasswordChange: (
    showPassword: boolean
  ) => void;
};

export default function ProtectOptions({
  password,
  confirmPassword,
  showPassword,
  onPasswordChange,
  onConfirmPasswordChange,
  onShowPasswordChange,
}: Props) {
  const passwordsMatch =
    password.length > 0 &&
    password === confirmPassword;

  return (
    <div className="mt-8 rounded-2xl border border-slate-700 bg-slate-900 p-6">
      <div className="mb-6 flex items-center gap-3">
        <LockKeyhole className="h-7 w-7 text-blue-400" />

        <div>
          <h2 className="text-2xl font-bold text-white">
            PDF Password
          </h2>

          <p className="mt-1 text-sm text-slate-400">
            The password will be required
            whenever the PDF is opened.
          </p>
        </div>
      </div>

      <div className="space-y-5">
        <div>
          <label className="mb-2 block font-semibold text-white">
            Password
          </label>

          <div className="relative">
            <input
              type={
                showPassword
                  ? "text"
                  : "password"
              }
              value={password}
              autoComplete="new-password"
              placeholder="Minimum 8 characters"
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

          <p className="mt-2 text-sm text-slate-400">
            Use at least 8 characters.
          </p>
        </div>

        <div>
          <label className="mb-2 block font-semibold text-white">
            Confirm Password
          </label>

          <input
            type={
              showPassword
                ? "text"
                : "password"
            }
            value={confirmPassword}
            autoComplete="new-password"
            placeholder="Enter the password again"
            onChange={(event) =>
              onConfirmPasswordChange(
                event.target.value
              )
            }
            className="w-full rounded-xl border border-slate-700 bg-slate-800 p-3 text-white outline-none focus:border-blue-500"
          />

          {confirmPassword.length >
            0 && (
            <p
              className={`mt-2 text-sm ${
                passwordsMatch
                  ? "text-green-400"
                  : "text-red-400"
              }`}
            >
              {passwordsMatch
                ? "Passwords match."
                : "Passwords do not match."}
            </p>
          )}
        </div>

        <div className="rounded-xl border border-blue-500/20 bg-blue-950/30 p-4 text-sm text-blue-200">
          Draflio uses 256-bit PDF
          encryption. Keep your password
          somewhere safe because it cannot
          be recovered from the protected
          file.
        </div>
      </div>
    </div>
  );
}