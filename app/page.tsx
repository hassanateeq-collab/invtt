export default function Home() {
  return (
    <main className="wrap">
      <section className="card">
        <div className="badge">
          <span className="dot" />
          Live
        </div>

        <div className="logo">invtt</div>
        <h1>Welcome to your portal 👋</h1>
        <p>
          If you can read this, your deployment is live and working. This is the
          starting point — build your portal from here.
        </p>

        <div className="meta">
          <span>
            Status: <strong>Online</strong>
          </span>
          <span>
            Stack: <strong>Next.js</strong>
          </span>
          <span>
            Host: <strong>Vercel</strong>
          </span>
        </div>
      </section>
    </main>
  );
}
