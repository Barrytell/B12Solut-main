import React from "react";
import { Link } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";
import { safeReturnTo } from "@/lib/authReturnTo";

export default function Register() {
  const returnTo = safeReturnTo();
  const loginUrl =
    "/login" + (returnTo !== "/" ? "?returnTo=" + encodeURIComponent(returnTo) : "");

  return (
    <AuthLayout
      icon={ShieldCheck}
      title="Accounts are created by an administrator"
      subtitle="There is no self sign-up for this store"
      footer={
        <>
          Already have your login details?{" "}
          <Link to={loginUrl} className="text-primary font-medium hover:underline">
            Log in
          </Link>
        </>
      }
    >
      <p className="text-sm text-muted-foreground text-center">
        Ask your store administrator to create your account. They give you a temporary password,
        and you choose your own the first time you log in.
      </p>
    </AuthLayout>
  );
}