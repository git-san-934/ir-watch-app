"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  addWatchedCompany,
  dismissDisclosure,
  DuplicateCompanyError,
  getArchivedDisclosures,
  getDismissedIds,
  getTreasuryStockArchive,
  listWatchedCompanies,
  mergeArchivedDisclosures,
  mergeTreasuryStockArchive,
  pruneDismissedIds,
  removeWatchedCompany,
  type WatchedCompany,
} from "@/lib/watchlist";
import {
  fetchDisclosuresSnapshot,
  filterByCodes,
  filterTreasuryStockDisclosures,
  type Disclosure,
} from "@/lib/tdnet";

type DisclosureItem = Disclosure & { isNew: boolean };
type Tab = "watchlist" | "treasury";

// TSE tickers are normally 4 digits, but JPX's newer alphanumeric codes
// (e.g. "130A") mix in letters too — accept either, case-insensitively.
const CODE_PATTERN = /^[0-9A-Za-z]{4}$/;

// The server-side snapshot refreshes every 15 min (see
// .github/workflows/deploy.yml); poll a bit more often than that so an
// open tab picks up a new snapshot soon after it's published.
const AUTO_REFRESH_INTERVAL_MS = 5 * 60 * 1000;

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("ja-JP", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function sortByPublishedAtDesc(a: Disclosure, b: Disclosure): number {
  return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
}

export default function Dashboard() {
  const [hydrated, setHydrated] = useState(false);
  const [companies, setCompanies] = useState<WatchedCompany[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>("watchlist");

  const [disclosures, setDisclosures] = useState<DisclosureItem[]>([]);
  const [treasuryDisclosures, setTreasuryDisclosures] = useState<DisclosureItem[]>([]);
  const [snapshotGeneratedAt, setSnapshotGeneratedAt] = useState<string | null>(null);
  const [loadingDisclosures, setLoadingDisclosures] = useState(false);
  const [disclosuresError, setDisclosuresError] = useState<string | null>(null);

  const [codeInput, setCodeInput] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  // Read by the auto-refresh effect below, which shouldn't need to
  // restart its interval/listener every time the watchlist changes.
  const companiesRef = useRef(companies);
  useEffect(() => {
    companiesRef.current = companies;
  }, [companies]);

  const loadDisclosures = useCallback(async (watchList: WatchedCompany[]) => {
    setLoadingDisclosures(true);
    setDisclosuresError(null);
    try {
      const codes = watchList.map((c) => c.code);
      const snapshot = await fetchDisclosuresSnapshot();

      // Merge only the ones not already archived — everything merged in
      // stays permanently (until dismissed), regardless of how long the
      // server-side snapshot itself keeps a given disclosure around.
      // Two independent feeds share the same snapshot fetch: one scoped
      // to the watchlist, one spanning every company for buyback news.
      const watchCandidates = filterByCodes(snapshot.disclosures, codes);
      const watchAdded = mergeArchivedDisclosures(watchCandidates);
      const watchAddedIds = new Set(watchAdded.map((d) => d.id));

      const treasuryCandidates = filterTreasuryStockDisclosures(snapshot.disclosures);
      const treasuryAdded = mergeTreasuryStockArchive(treasuryCandidates);
      const treasuryAddedIds = new Set(treasuryAdded.map((d) => d.id));

      const archive = getArchivedDisclosures();
      const treasuryArchive = getTreasuryStockArchive();
      pruneDismissedIds([...archive, ...treasuryArchive].map((d) => d.id));
      const dismissed = new Set(getDismissedIds());

      const visibleWatch = filterByCodes(archive, codes)
        .filter((d) => !dismissed.has(d.id))
        .map((d) => ({ ...d, isNew: watchAddedIds.has(d.id) }))
        .sort(sortByPublishedAtDesc);

      const visibleTreasury = treasuryArchive
        .filter((d) => !dismissed.has(d.id))
        .map((d) => ({ ...d, isNew: treasuryAddedIds.has(d.id) }))
        .sort(sortByPublishedAtDesc);

      setDisclosures(visibleWatch);
      setTreasuryDisclosures(visibleTreasury);
      setSnapshotGeneratedAt(snapshot.generatedAt);
    } catch {
      setDisclosuresError(
        "開示情報の取得に失敗しました。しばらくしてから再度お試しください。"
      );
    } finally {
      setLoadingDisclosures(false);
    }
  }, []);

  useEffect(() => {
    // Defer to a microtask so these state updates (hydrating from
    // localStorage, which is only available client-side) don't run
    // synchronously within the effect body itself.
    queueMicrotask(() => {
      const initial = listWatchedCompanies();
      setCompanies(initial);
      setHydrated(true);
      // Always load — the treasury-stock feed spans every company and
      // doesn't depend on having anything registered.
      void loadDisclosures(initial);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep both feeds in sync with the server-side snapshot while the tab
  // is open: poll periodically, and also refetch immediately whenever
  // the visitor switches back to this tab (covers the case where they
  // were away longer than the poll interval).
  useEffect(() => {
    function refresh() {
      void loadDisclosures(companiesRef.current);
    }

    const intervalId = setInterval(refresh, AUTO_REFRESH_INTERVAL_MS);

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        refresh();
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [loadDisclosures]);

  function handleAddCompany(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    const code = codeInput.trim().toUpperCase();
    const name = nameInput.trim();

    if (!CODE_PATTERN.test(code)) {
      setFormError("証券コードは4桁の英数字で入力してください");
      return;
    }
    if (!name) {
      setFormError("会社名を入力してください");
      return;
    }

    try {
      const company = addWatchedCompany(code, name);
      const next = [...companies, company];
      setCompanies(next);
      setCodeInput("");
      setNameInput("");
      void loadDisclosures(next);
    } catch (err) {
      setFormError(
        err instanceof DuplicateCompanyError ? "既に登録済みの銘柄です" : "登録に失敗しました"
      );
    }
  }

  function handleRemoveCompany(id: string) {
    removeWatchedCompany(id);
    const next = companies.filter((c) => c.id !== id);
    setCompanies(next);
    void loadDisclosures(next);
  }

  function handleDismissDisclosure(id: string) {
    dismissDisclosure(id);
    setDisclosures((prev) => prev.filter((d) => d.id !== id));
    setTreasuryDisclosures((prev) => prev.filter((d) => d.id !== id));
  }

  const activeList = activeTab === "watchlist" ? disclosures : treasuryDisclosures;
  const emptyMessage =
    activeTab === "watchlist"
      ? companies.length === 0
        ? "銘柄を登録すると、ここに開示情報が表示されます。"
        : "登録銘柄の開示情報はまだありません。"
      : "自己株式取得に関する開示はまだありません。";

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-10">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">IR Watch</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          東証(TDnet)の適時開示情報をまとめて確認できます。登録銘柄の新着開示に加えて、全銘柄の自己株式取得(自社株買い)関連の開示も別タブで確認できます。登録内容はこの端末のブラウザ内にのみ保存され、他の人には見えません。
        </p>
      </header>

      <section className="rounded-lg border border-zinc-200 p-5 dark:border-zinc-800">
        <h2 className="text-lg font-medium">監視銘柄</h2>

        <form onSubmit={handleAddCompany} className="mt-4 flex flex-wrap items-start gap-2">
          <div className="flex flex-col gap-1">
            <label htmlFor="code" className="text-xs text-zinc-500 dark:text-zinc-400">
              証券コード
            </label>
            <input
              id="code"
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
              placeholder="7203 / 130A"
              maxLength={4}
              className="w-28 rounded-md border border-zinc-300 bg-transparent px-3 py-1.5 text-sm dark:border-zinc-700"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="name" className="text-xs text-zinc-500 dark:text-zinc-400">
              会社名
            </label>
            <input
              id="name"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder="トヨタ自動車"
              className="w-56 rounded-md border border-zinc-300 bg-transparent px-3 py-1.5 text-sm dark:border-zinc-700"
            />
          </div>
          <button
            type="submit"
            className="mt-5 rounded-md bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            追加
          </button>
        </form>
        {formError && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{formError}</p>}

        {!hydrated ? null : companies.length === 0 ? (
          <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">
            まだ銘柄が登録されていません。証券コードと会社名を入力して追加してください。
          </p>
        ) : (
          <ul className="mt-4 flex flex-wrap gap-2">
            {companies.map((c) => (
              <li
                key={c.id}
                className="flex items-center gap-2 rounded-full border border-zinc-300 py-1 pl-3 pr-1 text-sm dark:border-zinc-700"
              >
                <span className="text-zinc-500 dark:text-zinc-400">{c.code}</span>
                <span>{c.name}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveCompany(c.id)}
                  aria-label={`${c.name} を削除`}
                  className="rounded-full px-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex-1">
        <div className="flex items-center justify-between">
          <div className="flex gap-1" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "watchlist"}
              onClick={() => setActiveTab("watchlist")}
              className={`rounded-full px-3 py-1 text-sm font-medium ${
                activeTab === "watchlist"
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
              }`}
            >
              監視銘柄
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "treasury"}
              onClick={() => setActiveTab("treasury")}
              className={`rounded-full px-3 py-1 text-sm font-medium ${
                activeTab === "treasury"
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
              }`}
            >
              自社株買い(全銘柄)
            </button>
          </div>
          <button
            type="button"
            onClick={() => void loadDisclosures(companies)}
            disabled={loadingDisclosures}
            className="text-sm text-zinc-500 hover:text-zinc-900 disabled:opacity-40 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            {loadingDisclosures ? "更新中..." : "更新"}
          </button>
        </div>

        {snapshotGeneratedAt && (
          <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
            データ更新: {formatDate(snapshotGeneratedAt)}時点・一度表示された開示情報は削除するまで残ります
          </p>
        )}

        {disclosuresError && (
          <p className="mt-3 text-sm text-red-600 dark:text-red-400">{disclosuresError}</p>
        )}

        {!loadingDisclosures && activeList.length === 0 && !disclosuresError ? (
          <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">{emptyMessage}</p>
        ) : (
          <ul className="mt-4 flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
            {activeList.map((d) => (
              <li key={d.id} className="flex items-start justify-between gap-3 py-3">
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                    {d.isNew && (
                      <span className="rounded bg-emerald-100 px-1.5 py-0.5 font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">
                        NEW
                      </span>
                    )}
                    <span>{d.code}</span>
                    <span>{d.companyName}</span>
                    <span>{formatDate(d.publishedAt)}</span>
                  </div>
                  <a
                    href={d.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium underline-offset-2 hover:underline"
                  >
                    {d.title}
                  </a>
                </div>
                <button
                  type="button"
                  onClick={() => handleDismissDisclosure(d.id)}
                  aria-label="この開示を非表示にする"
                  title="この開示を非表示にする"
                  className="shrink-0 rounded-full px-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
