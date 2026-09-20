-- Shared company-news cache.
--
-- One row per NORMALISED company, not per user and not per contact. News
-- about Revolut is news about Revolut: if a thousand users each know someone
-- there, they all read this one row and the provider sees one request a day
-- instead of a thousand.
--
-- Replaces a module-level Map keyed on `company|industry|role`, which died on
-- every deploy and fetched the same company again for each distinct
-- industry/role tagging. Industry and role are now applied when RANKING, after
-- this cache, so personalisation survives without fragmenting the lookup.
--
-- Additive and safe to apply while the app is running. The code checks for
-- this table with to_regclass and simply runs uncached when it is absent, so
-- it does not matter whether this runs before or after the deploy.
--
-- Size: a row is roughly 2-4 KB of JSON. Even 50,000 distinct companies is
-- well under 200 MB, and rows untouched for 30 days are pruned by the app.
CREATE TABLE IF NOT EXISTS company_news_cache (
    -- Normalised key from lib/news/companyKey.ts: lowercased, accents and
    -- punctuation removed, one trailing legal suffix dropped.
    company_key     text PRIMARY KEY,
    -- The name as a user typed it, kept for display and for re-querying the
    -- provider (which searches better on the real name than the flat key).
    display_company text NOT NULL,
    -- Which provider produced this, so a future switch can invalidate
    -- selectively rather than wholesale.
    provider        text NOT NULL,
    -- Raw, UNRANKED provider articles. Ranking is per contact and happens at
    -- read time; caching ranked output would defeat the point of sharing.
    articles        jsonb NOT NULL,
    fetched_at      timestamptz NOT NULL DEFAULT now(),
    expires_at      timestamptz NOT NULL
);

-- Supports the opportunistic prune of long-untouched rows.
CREATE INDEX IF NOT EXISTS company_news_cache_fetched_at_idx
    ON company_news_cache (fetched_at);
