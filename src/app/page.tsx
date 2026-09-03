import { getUserId } from "@/lib/session";
import { listWatchedCompanies } from "@/lib/watchlist";
import Dashboard from "@/components/Dashboard";

export default async function Home() {
  const userId = await getUserId();
  const companies = listWatchedCompanies(userId);

  return <Dashboard initialCompanies={companies} />;
}
