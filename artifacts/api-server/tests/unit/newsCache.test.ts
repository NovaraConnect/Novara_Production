// Behaviour of the shared company-news cache that cannot be checked by
// reading the code: what happens when the table is absent, when the provider
// fails, and when twenty contacts at the same company are requested at once.
//
// The database and the provider are both mocked. The integration suite
// (vitest.config.ts) needs a live Postgres and is not runnable in a plain
// checkout, so these paths would otherwise go untested entirely.
import { describe, it, expect, beforeEach, vi } from "vitest";

const query = vi.fn();
vi.mock("../../src/db", () => ({ pool: { query: (...a: unknown[]) => query(...a) } }));

const searchCompanyNews = vi.fn();
const isConfigured = vi.fn(() => true);
vi.mock("../../src/lib/news/provider", async () => {
  const actual = await vi.importActual<typeof import("../../src/lib/news/provider")>(
    "../../src/lib/news/provider",
  );
  return {
    ...actual,
    activeNewsProvider: () => ({
      name: "test",
      isConfigured: () => isConfigured(),
      searchCompanyNews: (c: string, s: AbortSignal) => searchCompanyNews(c, s),
    }),
    providerTimeoutMs: () => 50,
  };
});

const { getCompanyArticles, __resetNewsCacheState } = await import("../../src/lib/news/cache");

const ARTICLE = { title: "Revolut expands", url: "https://example.com/a" };

/** to_regclass answer for "does company_news_cache exist". */
function tableExists(exists: boolean) {
  query.mockImplementation((sql: string) => {
    if (typeof sql === "string" && sql.includes("to_regclass")) {
      return Promise.resolve({ rows: [{ exists }] });
    }
    return Promise.resolve({ rows: [] });
  });
}

beforeEach(() => {
  query.mockReset();
  searchCompanyNews.mockReset();
  isConfigured.mockReturnValue(true);
  __resetNewsCacheState();
});

describe("when the migration has not been applied yet", () => {
  it("still returns news instead of failing", async () => {
    tableExists(false);
    searchCompanyNews.mockResolvedValue([ARTICLE]);

    const out = await getCompanyArticles("revolut", "Revolut");

    expect(out.kind).toBe("hit");
    if (out.kind === "hit") expect(out.value.articles).toEqual([ARTICLE]);
  });
});

describe("request storms", () => {
  it("makes ONE provider call for twenty simultaneous requests", async () => {
    tableExists(false);
    let release!: (v: unknown[]) => void;
    searchCompanyNews.mockReturnValue(new Promise((r) => { release = r as never; }));

    const all = Promise.all(
      Array.from({ length: 20 }, () => getCompanyArticles("microsoft", "Microsoft")),
    );
    release([ARTICLE]);
    const results = await all;

    expect(searchCompanyNews).toHaveBeenCalledTimes(1);
    expect(results).toHaveLength(20);
    for (const r of results) expect(r.kind).toBe("hit");
  });

  it("serves the next request from memory even with no table", async () => {
    // This is what stops a deploy-before-migration from being WORSE than the
    // in-memory Map it replaced: the bounded L1 still absorbs repeats.
    tableExists(false);
    searchCompanyNews.mockResolvedValue([ARTICLE]);

    await getCompanyArticles("stripe", "Stripe");
    const second = await getCompanyArticles("stripe", "Stripe");

    expect(searchCompanyNews).toHaveBeenCalledTimes(1);
    expect(second.kind).toBe("hit");
    if (second.kind === "hit") expect(second.value.cached).toBe(true);
  });

  it("does not confuse two different companies", async () => {
    tableExists(false);
    searchCompanyNews.mockResolvedValue([ARTICLE]);

    await getCompanyArticles("stripe", "Stripe");
    await getCompanyArticles("monzo", "Monzo");

    expect(searchCompanyNews).toHaveBeenCalledTimes(2);
  });
});

describe("a fresh cached row", () => {
  it("is served without touching the provider", async () => {
    const fetchedAt = new Date();
    const expiresAt = new Date(Date.now() + 60_000);
    query.mockImplementation((sql: string) => {
      if (sql.includes("to_regclass")) return Promise.resolve({ rows: [{ exists: true }] });
      if (sql.includes("SELECT articles")) {
        return Promise.resolve({
          rows: [{ articles: [ARTICLE], fetched_at: fetchedAt, expires_at: expiresAt }],
        });
      }
      return Promise.resolve({ rows: [] });
    });

    const out = await getCompanyArticles("revolut", "Revolut");

    expect(out.kind).toBe("hit");
    expect(searchCompanyNews).not.toHaveBeenCalled();
  });
});

describe("when the provider is failing", () => {
  it("serves an expired row rather than nothing", async () => {
    const fetchedAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000); // 2 days old
    const expiresAt = new Date(Date.now() - 24 * 60 * 60 * 1000); // expired
    query.mockImplementation((sql: string) => {
      if (sql.includes("to_regclass")) return Promise.resolve({ rows: [{ exists: true }] });
      if (sql.includes("SELECT articles")) {
        return Promise.resolve({
          rows: [{ articles: [ARTICLE], fetched_at: fetchedAt, expires_at: expiresAt }],
        });
      }
      return Promise.resolve({ rows: [] });
    });
    searchCompanyNews.mockRejectedValue(new Error("HTTP 403 quota exceeded"));

    const out = await getCompanyArticles("revolut", "Revolut");

    expect(out.kind).toBe("stale");
    if (out.kind === "stale") {
      expect(out.value.articles).toEqual([ARTICLE]);
      expect(out.value.stale).toBe(true);
    }
  });

  it("returns empty — never throws — with no cached row at all", async () => {
    tableExists(true);
    searchCompanyNews.mockRejectedValue(new Error("HTTP 403 quota exceeded"));

    const out = await getCompanyArticles("revolut", "Revolut");

    expect(out.kind).toBe("empty");
    if (out.kind === "empty") expect(out.reason).toBe("fetch_failed");
  });

  it("reports a timeout distinctly", async () => {
    tableExists(true);
    const abort = new Error("The operation was aborted");
    abort.name = "AbortError";
    searchCompanyNews.mockRejectedValue(abort);

    const out = await getCompanyArticles("revolut", "Revolut");

    expect(out.kind).toBe("empty");
    if (out.kind === "empty") expect(out.reason).toBe("timeout");
  });
});

describe("when no provider key is configured", () => {
  it("says so, and does not call the provider", async () => {
    tableExists(true);
    isConfigured.mockReturnValue(false);

    const out = await getCompanyArticles("revolut", "Revolut");

    expect(out.kind).toBe("empty");
    if (out.kind === "empty") expect(out.reason).toBe("config_missing");
    expect(searchCompanyNews).not.toHaveBeenCalled();
  });
});

describe("a database that is broken rather than absent", () => {
  it("degrades to an uncached fetch instead of failing the request", async () => {
    query.mockRejectedValue(new Error("connection terminated"));
    searchCompanyNews.mockResolvedValue([ARTICLE]);

    const out = await getCompanyArticles("revolut", "Revolut");

    expect(out.kind).toBe("hit");
  });
});
