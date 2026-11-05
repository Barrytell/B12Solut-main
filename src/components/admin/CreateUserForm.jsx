import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Wand2, Eye, EyeOff, Copy } from "lucide-react";

export default function CreateUserForm({ onDone }) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("user");
  const [otpCode, setOtpCode] = useState("");
  const [step, setStep] = useState("details");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const generatePassword = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
    const values = new Uint32Array(12);
    crypto.getRandomValues(values);
    const generated = Array.from(values, (v) => chars[v % chars.length]).join("");
    setPassword(generated);
    setShowPassword(true);
  };

  const copyPassword = async () => {
    try {
      await navigator.clipboard.writeText(password);
      toast.success("Password copied");
    } catch {
      toast.error("Could not copy — reveal it and copy manually");
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await base44.auth.register({ email: email.trim(), password });
      setStep("code");
    } catch (err) {
      setError(err?.message || "Could not create the account");
    } finally {
      setLoading(false);
    }
  };

  const applyProfile = async () => {
    const users = await base44.entities.User.list();
    const created = users.find(
      (u) => u.email?.toLowerCase() === email.trim().toLowerCase()
    );
    if (created) {
      await base44.entities.User.update(created.id, {
        display_name: fullName.trim(),
        role,
      });
    }
  };

  const handleVerify = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await base44.auth.verifyOtp({ email: email.trim(), otpCode });
      await applyProfile();
      toast.success(`Account created for ${email.trim()}`);
      onDone?.();
    } catch (err) {
      setError(err?.message || "Invalid verification code");
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setError("");
    try {
      await base44.auth.resendOtp(email.trim());
      toast.success("A new code is on its way");
    } catch (err) {
      setError(err?.message || "Could not resend the code");
    }
  };

  if (step === "code") {
    return (
      <form onSubmit={handleVerify} className="bg-card rounded-xl border border-border p-5 space-y-4">
        <div>
          <h3 className="font-semibold">Confirm the new account</h3>
          <p className="text-xs text-muted-foreground mt-1">
            We emailed a 6-digit code to {email.trim()}. Ask the new user for that code to finish
            setting up their account.
          </p>
        </div>
        {error && (
          <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>
        )}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 space-y-1.5">
            <Label>Verification code</Label>
            <Input
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value)}
              inputMode="numeric"
              maxLength={6}
              placeholder="123456"
              autoFocus
              required
            />
          </div>
          <div className="flex items-end">
            <Button type="submit" disabled={loading || otpCode.length < 6}>
              {loading ? "Confirming..." : "Confirm account"}
            </Button>
          </div>
        </div>
        <button
          type="button"
          onClick={handleResend}
          className="text-xs text-primary font-medium hover:underline"
        >
          Resend code
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={handleRegister} className="bg-card rounded-xl border border-border p-5 space-y-4">
      <div>
        <h3 className="font-semibold">Create New User</h3>
        <p className="text-xs text-muted-foreground mt-1">
          Only administrators can create accounts. Set a starting password and share it with the
          user after confirming their email.
        </p>
      </div>
      {error && (
        <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Full name</Label>
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jane Doe" required />
        </div>
        <div className="space-y-1.5">
          <Label>Email</Label>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="cashier@store.com" required />
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label>Starting password</Label>
            <button
              type="button"
              onClick={generatePassword}
              className="flex items-center gap-1 text-xs text-primary font-medium hover:underline"
            >
              <Wand2 className="w-3 h-3" /> Generate
            </button>
          </div>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                className="pr-10 font-mono"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={copyPassword}
              disabled={!password}
              aria-label="Copy password"
            >
              <Copy className="w-4 h-4" />
            </Button>
          </div>
          {password && (
            <p className="text-xs text-muted-foreground">
              Share this password with the user so they can log in.
            </p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label>Role</Label>
          <Select value={role} onValueChange={setRole}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="user">Cashier</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <Button type="submit" disabled={loading}>
        {loading ? "Creating..." : "Create account"}
      </Button>
    </form>
  );
}