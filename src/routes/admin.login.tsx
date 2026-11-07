import { useState, type FormEvent } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/admin/login")({
  head: () => ({
    meta: [
      { title: "Admin Login — Events Multimedia GH" },
      { name: "description", content: "Studio admin sign in." },
      { property: "og:title", content: "Admin Login — Events Multimedia GH" },
      { property: "og:description", content: "Studio admin sign in." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminLogin,
});

function AdminLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    localStorage.setItem("emgh_admin", "1");
    navigate({ to: "/admin" });
  };
  return (
    <main className="flex min-h-screen items-center justify-center bg-secondary px-6">
      <form onSubmit={submit} className="w-full max-w-sm space-y-6 border border-border bg-card p-10">
        <div>
          <Link to="/" className="flex items-center gap-2">
            <img src="/logo.jpg" alt="Events Multimedia GH" className="h-9 w-auto rounded-sm" />
            <span className="font-serif text-2xl">Events Multimedia <span className="text-accent">GH</span></span>
          </Link>
          <p className="mt-1 text-sm text-muted-foreground">Studio admin</p>
        </div>
        <div className="space-y-2"><Label htmlFor="email">Email</Label><Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div className="space-y-2"><Label htmlFor="pw">Password</Label><Input id="pw" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} /></div>
        <Button type="submit" className="w-full">Sign in</Button>
      </form>
    </main>
  );
}
