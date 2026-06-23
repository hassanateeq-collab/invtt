import { createServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type DbStatus = {
  ok: boolean;
  count: number | null;
  detail: string;
  env: { url: boolean; anon: boolean; service: boolean };
};

async function getDbStatus(): Promise<DbStatus> {
  const env = {
    url: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    anon: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    service: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
  };

  if (!env.url || !env.service) {
    return { ok: false, count: null, detail: "Supabase env vars are not set in this environment.", env };
  }
  try {
    const supabase = createServerClient();
    const { count, error } = await supabase
      .from("items")
      .select("*", { count: "exact", head: true });
    if (error) {
      return {
        ok: false,
        count: null,
        detail: `${error.message}${error.hint ? ` (hint: ${error.hint})` : ""}`,
        env,
      };
    }
    return { ok: true, count: count ?? 0, detail: "Connected to invtt schema", env };
  } catch (e) {
    return { ok: false, count: null, detail: e instanceof Error ? e.message : "Unknown error", env };
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
              Database: <strong>not connected</strong>
            </span>
          )}
        </div>

        {!db.ok && (
          <div className="diag">
            <div className="diag-row">
              <span>NEXT_PUBLIC_SUPABASE_URL</span>
              <strong className={db.env.url ? "yes" : "no"}>{db.env.url ? "set" : "missing"}</strong>
            </div>
            <div className="diag-row">
              <span>NEXT_PUBLIC_SUPABASE_ANON_KEY</span>
              <strong className={db.env.anon ? "yes" : "no"}>{db.env.anon ? "set" : "missing"}</strong>
            </div>
            <div className="diag-row">
              <span>SUPABASE_SERVICE_ROLE_KEY</span>
              <strong className={db.env.service ? "yes" : "no"}>{db.env.service ? "set" : "missing"}</strong>
            </div>
            <p className="diag-detail">{db.detail}</p>
          </div>
        )}
      </section>
    </main>
  );
}
