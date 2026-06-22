"use client";

import * as React from "react";
import { LogOut } from "lucide-react";
import { Button, type ButtonProps } from "./ui/button";

export interface SignOutButtonProps {
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  labelled?: boolean;
  className?: string;
}

/**
 * Signs out via the server route POST /auth/signout (clears the session
 * cookie server-side), then falls back to a /login redirect. The form post
 * works even without JS; the click handler shows a pending state.
 */
export function SignOutButton({
  variant = "ghost",
  size = "icon",
  labelled,
  className,
}: SignOutButtonProps) {
  const [pending, setPending] = React.useState(false);

  return (
    <form
      action="/auth/signout"
      method="post"
      onSubmit={() => setPending(true)}
      className="contents"
    >
      <Button
        type="submit"
        variant={variant}
        size={labelled ? "md" : size}
        disabled={pending}
        aria-label="Sign out"
        title="Sign out"
        className={className}
      >
        <LogOut className="h-4 w-4" />
        {labelled && (pending ? "Signing out…" : "Sign out")}
      </Button>
    </form>
  );
}
