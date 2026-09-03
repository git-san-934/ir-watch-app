import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/session";
import { fetchRecentDisclosures, filterByCodes } from "@/lib/tdnet";
import { getLastCheckedAt, listWatchedCompanies, setLastCheckedAt } from "@/lib/watchlist";

const DEFAULT_DAYS = 7;
const MAX_DAYS = 30;

export async function GET(request: NextRequest) {
  const userId = await getUserId();
  const companies = listWatchedCompanies(userId);

  if (companies.length === 0) {
    return NextResponse.json({ disclosures: [], lastCheckedAt: null });
  }

  const daysParam = Number(request.nextUrl.searchParams.get("days"));
  const days = Number.isFinite(daysParam) && daysParam > 0
    ? Math.min(Math.trunc(daysParam), MAX_DAYS)
    : DEFAULT_DAYS;

  const previousCheckedAt = getLastCheckedAt(userId);

  let disclosures;
  try {
    const all = await fetchRecentDisclosures(days);
    disclosures = filterByCodes(all, companies.map((c) => c.code));
  } catch (err) {
    console.error("Failed to fetch TDnet disclosures", err);
    return NextResponse.json(
      { error: "開示情報の取得に失敗しました。しばらくしてから再度お試しください。" },
      { status: 502 }
    );
  }

  const withFlags = disclosures.map((d) => ({
    ...d,
    isNew: previousCheckedAt ? new Date(d.publishedAt) > previousCheckedAt : true,
  }));

  setLastCheckedAt(userId, new Date());

  return NextResponse.json({
    disclosures: withFlags,
    lastCheckedAt: previousCheckedAt?.toISOString() ?? null,
  });
}
