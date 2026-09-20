// ============================================================================
// GET /api/company-news — recent headlines about a contact's employer.
//
// THE SHAPE OF THE FIX
// --------------------
// This route used to own an in-memory Map keyed on `company|industry|role`,
// which meant the same company was fetched again after every deploy, and
// again for every distinct industry/role tagging of the same employer.
//
// Now the split is:
//
//   lib/news/companyKey  normalise the name        ("Revolut Ltd" -> revolut)
//   lib/news/cache       ONE shared row per company, in Postgres, 24h
//   lib/news/provider    the only code that knows GNews exists
//   this route           rank the shared result for THIS contact
//
// Industry and role never reach the provider or the cache key. They are
// applied here, at read time, by the existing ranker — so personalisation is
// unchanged while one cached company result serves every user who knows
// someone there.
//
// The response shape is deliberately unchanged; hooks/useCompanyNews.ts and
// its localStorage cache continue to work untouched.
// ============================================================================
import { Router } from "express";
import { requireAuth } from "../middlewares/auth";
import { selectHeadlines, type NewsHeadline } from "../lib/newsRanking";
import { companyCacheKey, displayCompanyName } from "../lib/news/companyKey";
import { getCompanyArticles } from "../lib/news/cache";

const router = Router();

// Re-exported for existing importers.
export type Headline = NewsHeadline;

/** How many headlines a contact screen shows. Note this is NOT the number we
 *  ask the provider for: providers bill per REQUEST, so we fetch a wider set
 *  (PROVIDER_ARTICLE_LIMIT) at the same price and let the ranker pick the
 *  best few. Raising this would not cost more; it would just show more. */
const HEADLINES_SHOWN = 3;

router.get("/company-news", requireAuth, async (req, res) => {
  const rawCompany = (req.query["company"] as string | undefined)?.trim();
  const industry = ((req.query["industry"] as string | undefined) ?? "").trim();
  const role = ((req.query["role"] as string | undefined) ?? "").trim();

  if (!rawCompany) {
    res.status(400).json({ error: "Missing company query parameter" });
    return;
  }

  const company = displayCompanyName(rawCompany);
  const key = companyCacheKey(rawCompany);

  // Nothing usable survived normalisation (punctuation only, say). Do not
  // spend a provider request on it and do not create a junk cache row.
  if (!key) {
    res.json({ company, headlines: [], fetchedAt: Date.now(), fromCache: false });
    return;
  }

  const outcome = await getCompanyArticles(key, company);

  if (outcome.kind === "empty") {
    res.json({
      company,
      headlines: [],
      fetchedAt: Date.now(),
      fromCache: false,
      error: outcome.reason,
      detail:
        outcome.reason === "config_missing"
          ? "Company news is not configured."
          : outcome.reason === "timeout"
            ? "The news provider timed out."
            : "The news provider could not be reached.",
    });
    return;
  }

  // Ranking happens per request, against THIS contact's industry and role,
  // over the shared company-level articles.
  const headlines = selectHeadlines(
    outcome.value.articles,
    { company, industry, role },
    HEADLINES_SHOWN,
  );

  res.json({
    company,
    headlines,
    fetchedAt: outcome.value.fetchedAt,
    // "Served without a provider request" — reported honestly by the cache
    // rather than inferred from timestamps.
    fromCache: outcome.value.cached,
    ...(outcome.kind === "stale" ? { stale: true } : {}),
  });
});

export default router;
