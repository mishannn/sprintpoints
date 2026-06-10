import { Sparkles } from "lucide-react";

export function SetupRequiredPage() {
  return (
    <main className="shell centered">
      <section className="setup-panel">
        <div className="brand-mark">
          <Sparkles size={26} aria-hidden="true" />
        </div>
        <h1>Connect Supabase to start planning</h1>
        <p>
          Create a cloud Supabase project, run the SQL migration in <code>supabase/migrations</code>, then copy{" "}
          <code>.env.example</code> to <code>.env</code> and set your project URL and anon key.
        </p>
      </section>
    </main>
  );
}
