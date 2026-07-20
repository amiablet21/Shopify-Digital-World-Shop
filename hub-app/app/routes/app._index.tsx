import type { LoaderFunctionArgs } from "@remix-run/node";
import { Link, useLoaderData } from "@remix-run/react";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { formatCents } from "../money";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const [
    pendingApplications,
    activeOffers,
    acceptedOffers,
    companies,
    watches,
    recentApplications,
    offersNeedingReply,
  ] = await Promise.all([
    db.application.count({ where: { shop, status: "PENDING" } }),
    db.offer.count({ where: { shop, status: { in: ["PENDING", "COUNTERED"] } } }),
    db.offer.count({ where: { shop, status: "ACCEPTED" } }),
    db.company.count({ where: { shop } }),
    db.watch.count({ where: { shop } }),
    db.application.findMany({
      where: { shop, status: "PENDING" },
      orderBy: { createdAt: "desc" },
      take: 6,
    }),
    db.offer.findMany({
      where: { shop, status: "PENDING" },
      orderBy: { createdAt: "desc" },
      take: 6,
    }),
  ]);

  return {
    stats: { pendingApplications, activeOffers, acceptedOffers, companies, watches },
    recentApplications,
    offersNeedingReply,
  };
};

const css = `
  .dwh {
    --bg: #f8f4ec; --panel: #fffdf8; --panel2: #f3ecdf;
    --line: #e6dfd2; --line-strong: #d4cab6;
    --text: #1c1b17; --text2: #6e6a5f; --text3: #a09a8c;
    --accent: #3a6ccc; --accent-soft: #eaf0fb;
    --cta: #f97b28; --cta-soft: #fdeede; --cta-text: #c25107;
    --warn: #8a6d10; --warn-soft: #f5ecd8;
    --navy: #1f3d6f; --r: 4px;
    --font: "Geist", system-ui, sans-serif;
    --mono: "Geist Mono", ui-monospace, monospace;
    --wordmark: "Archivo", sans-serif;
    background: var(--bg); min-height: 100vh;
    margin: 0; padding: 22px 26px 60px;
    font: 13.5px/1.45 var(--font); color: var(--text);
  }
  .dwh * { box-sizing: border-box; }
  .dwh a { text-decoration: none; }
  .dwh-head { display: flex; align-items: baseline; gap: 14px; margin-bottom: 18px; }
  .dwh-word {
    font-family: var(--wordmark); font-weight: 800; font-size: 17px;
    letter-spacing: .02em; text-transform: uppercase; color: var(--navy);
  }
  .dwh-sub {
    font-family: var(--mono); font-size: 9.5px; font-weight: 500;
    letter-spacing: .22em; text-transform: uppercase; color: var(--text3);
  }
  .dwh-stats {
    display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 10px; margin-bottom: 16px;
  }
  .dwh-stat {
    background: var(--panel); border: 1px solid var(--line); border-radius: var(--r);
    padding: 14px 16px; display: flex; flex-direction: column; gap: 3px;
    transition: border-color .12s; position: relative;
  }
  .dwh-stat:hover { border-color: var(--accent); }
  .dwh-stat-v {
    font-family: var(--mono); font-variant-numeric: tabular-nums;
    font-size: 26px; font-weight: 700; color: var(--navy); line-height: 1.1;
  }
  .dwh-stat-v.hot { color: var(--cta-text); }
  .dwh-stat-k { font-size: 11.5px; color: var(--text2); font-weight: 500; }
  .dwh-chip {
    position: absolute; top: 10px; right: 10px;
    font-size: 9.5px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase;
    background: var(--cta-soft); color: var(--cta-text);
    border: 1px solid var(--cta); border-radius: var(--r); padding: 1px 6px;
  }
  .dwh-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  @media (max-width: 860px) { .dwh-cols { grid-template-columns: 1fr; } }
  .dwh-panel { background: var(--panel); border: 1px solid var(--line); border-radius: var(--r); overflow: hidden; }
  .dwh-strip {
    background: var(--panel2); border-bottom: 1px solid var(--line);
    padding: 8px 14px; display: flex; align-items: center; justify-content: space-between;
  }
  .dwh-strip-t {
    font-size: 10.5px; font-weight: 600; letter-spacing: .07em;
    text-transform: uppercase; color: var(--text2);
  }
  .dwh-strip a { font-size: 12px; font-weight: 600; color: var(--accent); }
  .dwh-strip a:hover { text-decoration: underline; }
  .dwh-row { padding: 10px 14px; border-top: 1px solid var(--line); }
  .dwh-panel .dwh-row:first-of-type { border-top: 0; }
  .dwh-row:hover { background: var(--panel2); }
  .dwh-row-t { font-weight: 600; font-size: 13px; }
  .dwh-row-s { font-size: 12px; color: var(--text2); margin-top: 2px; }
  .dwh-row-s .m { font-family: var(--mono); font-variant-numeric: tabular-nums; }
  .dwh-empty { padding: 30px 14px; text-align: center; color: var(--text3); font-size: 12.5px; }
  .dwh-quick { display: flex; gap: 8px; margin-top: 16px; flex-wrap: wrap; }
  .dwh-btn {
    display: inline-flex; align-items: center; gap: 6px;
    border: 1px solid var(--line-strong); background: var(--panel); color: var(--text);
    border-radius: var(--r); padding: 7px 14px; font-size: 12.5px; font-weight: 600;
  }
  .dwh-btn:hover { border-color: var(--accent); color: var(--accent); }
`;

export default function Dashboard() {
  const { stats, recentApplications, offersNeedingReply } = useLoaderData<typeof loader>();

  return (
    <div className="dwh">
      <TitleBar title="Digital World Hub" />
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@500;700&family=Archivo:wght@800&display=swap"
        rel="stylesheet"
      />
      <style dangerouslySetInnerHTML={{ __html: css }} />

      <div className="dwh-head">
        <span className="dwh-word">Digital World Hub</span>
        <span className="dwh-sub">B2B Operations</span>
      </div>

      <div className="dwh-stats">
        <Link to="/app/applications" className="dwh-stat">
          {stats.pendingApplications > 0 && <span className="dwh-chip">Action</span>}
          <span className={`dwh-stat-v${stats.pendingApplications > 0 ? " hot" : ""}`}>
            {stats.pendingApplications}
          </span>
          <span className="dwh-stat-k">Pending applications</span>
        </Link>
        <Link to="/app/offers" className="dwh-stat">
          {stats.activeOffers > 0 && <span className="dwh-chip">Action</span>}
          <span className={`dwh-stat-v${stats.activeOffers > 0 ? " hot" : ""}`}>
            {stats.activeOffers}
          </span>
          <span className="dwh-stat-k">Offers awaiting reply</span>
        </Link>
        <Link to="/app/offers" className="dwh-stat">
          <span className="dwh-stat-v">{stats.acceptedOffers}</span>
          <span className="dwh-stat-k">Accepted offers</span>
        </Link>
        <Link to="/app/customers" className="dwh-stat">
          <span className="dwh-stat-v">{stats.companies}</span>
          <span className="dwh-stat-k">Companies</span>
        </Link>
        <div className="dwh-stat">
          <span className="dwh-stat-v">{stats.watches}</span>
          <span className="dwh-stat-k">Watched items</span>
        </div>
      </div>

      <div className="dwh-cols">
        <div className="dwh-panel">
          <div className="dwh-strip">
            <span className="dwh-strip-t">Applications to review</span>
            <Link to="/app/applications">View all</Link>
          </div>
          {recentApplications.length === 0 && (
            <div className="dwh-empty">Nothing waiting. New storefront applications land here.</div>
          )}
          {recentApplications.map((application) => (
            <div className="dwh-row" key={application.id}>
              <div className="dwh-row-t">{application.company}</div>
              <div className="dwh-row-s">
                {application.contact} · {application.email}
                {application.volume ? ` · ${application.volume}/mo` : ""}
              </div>
            </div>
          ))}
        </div>

        <div className="dwh-panel">
          <div className="dwh-strip">
            <span className="dwh-strip-t">Offers to answer</span>
            <Link to="/app/offers">View all</Link>
          </div>
          {offersNeedingReply.length === 0 && (
            <div className="dwh-empty">No open offers. Buyer offers from the storefront appear here.</div>
          )}
          {offersNeedingReply.map((offer) => (
            <div className="dwh-row" key={offer.id}>
              <div className="dwh-row-t">
                #{offer.id} · {offer.sku} · {offer.quantity} units at {formatCents(offer.offerCents)}
              </div>
              <div className="dwh-row-s">
                {offer.customerEmail} · list <span className="m">{formatCents(offer.listPriceCents)}</span>{" "}
                · total <span className="m">{formatCents(offer.offerCents * offer.quantity)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="dwh-quick">
        <Link to="/app/customers" className="dwh-btn">Create a company</Link>
        <Link to="/app/offers" className="dwh-btn">Review offers</Link>
        <Link to="/app/setup" className="dwh-btn">Store setup</Link>
      </div>
    </div>
  );
}
