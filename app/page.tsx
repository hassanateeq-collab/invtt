import { createServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

async function getDbStatus(): Promise<{ ok: boolean; count: number | null; detail: string }> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return { ok: false, count: null, detail: "Env vars not set yet" };
  }
  try {
    const supabase = createServerClient();
    const { count, error } = await supabase
      .from("items")
      .select("*", { count: "exact", head: true });
    if (error) return { ok: false, count: null, detail: error.message };
    return { ok: true, count: count ?? 0, detail: "Connected to invtt schema" };
  } catch (e) {
    return { ok: false, count: null, detail: e instanceof Error ? e.message : "Unknown error" };
  }
}

export default async function Home() {
  const db = await getDbStatus();

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

        <div className={`db ${db.ok ? "db-ok" : "db-off"}`}>
          <span className="db-dot" />
          {db.ok ? (
            <span>
              Database: <strong>connected</strong>
              {db.count !== null ? ` · ${db.count} item${db.count === 1 ? "" : "s"} in invtt schema` : ""}
            </span>
          ) : (
            <span>
              Database: <strong>not connected</strong> · {db.detail}
            </span>
          )}
        </div>
      </section>
    </main>
  );
}
