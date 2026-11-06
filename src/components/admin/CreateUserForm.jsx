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

// D1: administrators invite users by email; each user sets their own password
// through the link in the invitation. Nobody can register themselves.
export default function CreateUserForm({ onDone }) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("user");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleInvite = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api.users.invite({ email: email.trim(), display_name: fullName.trim(), role });
      toast.success(`Invitation sent to ${email.trim()}`);
      onDone?.();
    } catch (err) {
      setError(err?.message || "Could not send the invitation");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleInvite} className="bg-card rounded-xl border border-border p-5 space-y-4">
      <div>
        <h3 className="font-semibold">Invite New User</h3>
        <p className="text-xs text-muted-foreground mt-1">
          Only administrators can create accounts. The user receives an email invitation and sets
          their own password. They can also sign in with Google using the same email address.
        </p>
      </div>
      {error && (
        <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label>Full name</Label>
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jane Doe" required />
        </div>
        <div className="space-y-1.5">
          <Label>Email</Label>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="cashier@store.com" required />
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
        {loading ? "Sending..." : "Send invitation"}
      </Button>
    </form>
  );
}
