import React, { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Lock, Loader2, AlertTriangle } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";

// Landing page for both password-reset emails and admin invitations (?invite=1).
// supabase-js turns the link into a session; the user then sets a password.
export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const isInvite = searchParams.get("invite") === "1";

  const [status, setStatus] = useState("checking"); // checking | ready | invalid
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // An expired or reused link comes back with an error in the URL.
    const hash = new URLSearchParams(window.location.hash.slice(1));
    if (hash.get("error") || searchParams.get("error")) {
      setStatus("invalid");
      return undefined;
    }
    let settled = false;
    const ready = () => { settled = true; setStatus("ready"); };
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN" || event === "INITIAL_SESSION")) ready();
    });
    supabase.auth.getSession().then(({ data }) => { if (data.session) ready(); });
    const timer = setTimeout(() => { if (!settled) setStatus("invalid"); }, 4000);
    return () => { clearTimeout(timer); sub.subscription.unsubscribe(); };
  }, [searchParams]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (newPassword.length < 8) {
      setError("Use at least 8 characters");
      return;
    }
    setLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) throw updateError;
      window.location.href = "/";
    } catch (err) {
      setError(err.message || "Failed to set the password");
    } finally {
      setLoading(false);
    }
  };

  if (status === "checking") {
    return (
      <AuthLayout icon={Lock} title={isInvite ? "Set your password" : "New password"} subtitle="Checking your link…">
        <div className="flex justify-center py-6"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      </AuthLayout>
    );
  }

  if (status === "invalid") {
    return (
      <AuthLayout
        icon={AlertTriangle}
        title={isInvite ? "Invalid invitation link" : "Invalid reset link"}
        subtitle={isInvite ? "This invitation link has expired or was already used" : "This password reset link has expired or was already used"}
        footer={
          isInvite ? <>Ask your store administrator to resend the invitation.</> : (
            <Link to="/forgot-password" className="text-primary font-medium hover:underline">
              Request a new link
            </Link>
          )
        }
      >
        <p className="text-sm text-foreground text-center">
          {isInvite
            ? "Invitation links work once and expire. A new one can be sent from the Users page."
            : "The link you used is incomplete, expired or already used. Please request a new password reset email."}
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      icon={Lock}
      title={isInvite ? "Set your password" : "New password"}
      subtitle={isInvite ? "Choose a password to finish setting up your account" : "Enter your new password below"}
    >
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="password">New Password</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              autoFocus
              placeholder="••••••••"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="pl-10 h-12"
              required
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm">Confirm Password</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="confirm"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="pl-10 h-12"
              required
            />
          </div>
        </div>
        <Button type="submit" className="w-full h-12 font-medium" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            isInvite ? "Set password" : "Reset password"
          )}
        </Button>
      </form>
    </AuthLayout>
  );
}
