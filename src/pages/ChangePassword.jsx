import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/api/client";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { KeyRound, Lock, Loader2 } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";

const PASSWORD_OK = (p) => p.length >= 10 && p.length <= 72 && /[A-Za-z]/.test(p) && /\d/.test(p);

// Used for the forced change after an admin-set temporary password, and any
// time later from the account menu. The server verifies the current password.
export default function ChangePassword() {
  const { user, checkAppState, logout } = useAuth();
  const navigate = useNavigate();
  const forced = user?.must_change_password === true;
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (next !== confirm) { setError("The new passwords do not match"); return; }
    if (!PASSWORD_OK(next)) { setError("Use at least 10 characters, with letters and digits"); return; }
    if (next === current) { setError("Choose a password different from the current one"); return; }
    setLoading(true);
    try {
      await api.auth.changePassword({ current_password: current, new_password: next });
      await checkAppState(); // reloads /api/auth/me, clearing the forced-change state
      navigate("/", { replace: true });
    } catch (err) {
      setError(err?.message || "The password could not be changed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      icon={KeyRound}
      title={forced ? "Choose your password" : "Change password"}
      subtitle={forced
        ? "Your account was created with a temporary password. Choose your own to continue."
        : "Enter your current password and a new one"}
      footer={forced
        ? <button type="button" onClick={() => logout()} className="text-primary font-medium hover:underline">Log out</button>
        : <button type="button" onClick={() => navigate(-1)} className="text-primary font-medium hover:underline">Cancel</button>}
    >
      {error && <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>}
      <form onSubmit={handleSubmit} className="space-y-4">
        {[
          ["current", forced ? "Temporary password" : "Current password", current, setCurrent, "current-password"],
          ["new", "New password", next, setNext, "new-password"],
          ["confirm", "Confirm new password", confirm, setConfirm, "new-password"],
        ].map(([id, label, value, set, auto]) => (
          <div className="space-y-2" key={id}>
            <Label htmlFor={id}>{label}</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
              <Input id={id} type="password" autoComplete={auto} value={value} onChange={(e) => set(e.target.value)}
                className="pl-10 h-12" maxLength={72} required autoFocus={id === "current"} />
            </div>
          </div>
        ))}
        <p className="text-xs text-muted-foreground">At least 10 characters, with letters and digits.</p>
        <Button type="submit" className="w-full h-12 font-medium" disabled={loading}>
          {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving...</> : "Save new password"}
        </Button>
      </form>
    </AuthLayout>
  );
}
