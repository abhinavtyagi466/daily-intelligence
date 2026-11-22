import Link from "next/link";

export default function NotFound() {
  return (
    <main className="login-page">
      <div className="login-card">
        <h1>Page not found</h1>
        <p><Link href="/">Return to Command Center</Link></p>
      </div>
    </main>
  );
}
