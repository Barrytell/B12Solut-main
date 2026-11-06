import React, { useState } from "react";
import { api } from "@/api/client";
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

// Same rule as the server and the Supabase project (README).
const PASSWORD_OK = (p) => p.length >= 10 && p.length <= 72 && /[A-Za-z]/.test(p) && /\d/.test(p);

// Administrators create Admin and Cashier accounts. The initial password is
// temporary: the new user must change it at their first login.
export default function CreateUserForm({ onDone }) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("user");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const generatePassword = () => {
    const letters = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
    const chars = `${letters}23456789!@#$%`;
    const values = new Uint32Array(14);
    crypto.getRandomValues(values);
    let generated = Array.from(values, (v) => chars[v % chars.length]).join("");
    // guarantee the policy: at least one letter and one digit
    generated = letters[values[0] % letters.length] + "23456789"[values[1] % 8] + generated.slice(2);
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

  const handleCreate = async (e) => {
    e.preventDefault();
    setError("");
    if (!PASSWORD_OK(password)) {
      setError("The initial password needs at least 10 characters, with letters and digits.");
      return;
    }
    setLoading(true);
    try {
      await api.users.create({ full_name: fullName.trim(), email: email.trim(), password, role });
      toast.success(`Account created for ${email.trim()}. Share the temporary password with them securely.`);
      setPassword("");
      onDone?.();
    } catch (err) {
      setError(err?.message || "Could not create the account");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleCreate} className="bg-card rounded-xl border border-border p-5 space-y-4">
      <div>
        <h3 className="font-semibold">Create New User</h3>
        <p className="text-xs text-muted-foreground mt-1">
          Only administrators can create accounts. Set an initial password and share it with the
          user securely. It is temporary: they must choose their own password at first login.
        </p>
      </div>
      {error && (
        <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Full name</Label>
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jane Doe" maxLength={200} required />
        </div>
        <div className="space-y-1.5">
          <Label>Email</Label>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="cashier@store.com" autoComplete="off" required />
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label>Initial password</Label>
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
                placeholder="At least 10 characters, letters and digits"
                className="pr-10 font-mono"
                autoComplete="new-password"
                maxLength={72}
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
          <p className="text-xs text-muted-foreground">Temporary: the user changes it at first login.</p>
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
