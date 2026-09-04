"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  addWatchedCompany,
  dismissDisclosure,
  DuplicateCompanyError,
  getArchivedDisclosures,
  getArchivedFilings,
  getDismissedIds,
  listWatchedCompanies,
  mergeArchivedDisclosures,
  mergeArchivedFilings,
  pruneDismissedIds,
  removeWatchedCompany,
  type WatchedCompany,
} from "@/lib/watchlist";
import {
  fetchDisclosuresSnapshot,
  fetchTreasuryStockSummary,
  filterByCodes,
  type Disclosure,
  type TreasuryStockSummaryRow,
} from "@/lib/tdnet";
import {
  fetchEdinetFilingsSnapshot,
  filterFilingsByCodes,
  type EdinetFiling,
} from "@/lib/edinet";

type DisclosureItem = Disclosure & { isNew: boolean };
type FilingItem = EdinetFiling & { isNew: boolean };
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

function formatYen(amount: number | null): string {
  if (amount === null) return "—";
  return `${amount.toLocaleString("ja-JP")}円`;
}

function sortByPublishedAtDesc(a: Disclosure, b: Disclosure): number {
  return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
}

export default function Dashboard() {
  const [hydrated, setHydrated] = useState(false);
  const [companies, setCompanies] = useState<WatchedCompany[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>("watchlist");

  const [disclosures, setDisclosures] = useState<DisclosureItem[]>([]);
  const [snapshotGeneratedAt, setSnapshotGeneratedAt] = useState<string | null>(null);

  const [treasurySummary, setTreasurySummary] = useState<TreasuryStockSummaryRow[]>([]);
  const [treasurySummaryGeneratedAt, setTreasurySummaryGeneratedAt] = useState<string | null>(
    null
  );

  const [loadingDisclosures, setLoadingDisclosures] = useState(false);
  const [disclosuresError, setDisclosuresError] = useState<string | null>(null);

  const [filings, setFilings] = useState<FilingItem[]>([]);
  const [filingsGeneratedAt, setFilingsGeneratedAt] = useState<string | null>(null);
  const [loadingFilings, setLoadingFilings] = useState(false);
  const [filingsError, setFilingsError] = useState<string | null>(null);

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

      // Two independent, unrelated data sources loaded together: the
      // per-company watchlist feed (from the raw disclosure snapshot,
      // merged into a permanent local archive) and the treasury-stock
      // summary table (pre-aggregated server-side across every company,
      // see scripts/fetch-tdnet.ts / src/lib/treasury-stock.ts).
      const [snapshotResult, treasuryResult] = await Promise.allSettled([
        fetchDisclosuresSnapshot(),
        fetchTreasuryStockSummary(),
      ]);

      if (snapshotResult.status === "fulfilled") {
        const snapshot = snapshotResult.value;
        const watchCandidates = filterByCodes(snapshot.disclosures, codes);
        const watchAdded = mergeArchivedDisclosures(watchCandidates);
        const watchAddedIds = new Set(watchAdded.map((d) => d.id));

        const archive = getArchivedDisclosures();
        pruneDismissedIds(archive.map((d) => d.id));
        const dismissed = new Set(getDismissedIds());

        const visibleWatch = filterByCodes(archive, codes)
          .filter((d) => !dismissed.has(d.id))
          .map((d) => ({ ...d, isNew: watchAddedIds.has(d.id) }))
          .sort(sortByPublishedAtDesc);

        setDisclosures(visibleWatch);
        setSnapshotGeneratedAt(snapshot.generatedAt);
      }

      if (treasuryResult.status === "fulfilled") {
        setTreasurySummary(treasuryResult.value.rows);
        setTreasurySummaryGeneratedAt(treasuryResult.value.generatedAt);
      }

      if (snapshotResult.status === "rejected" && treasuryResult.status === "rejected") {
        setDisclosuresError(
          "開示情報の取得に失敗しました。しばらくしてから再度お試しください。"
        );
      } else if (snapshotResult.status === "rejected") {
        setDisclosuresError(
          "監視銘柄の開示情報の取得に失敗しました。しばらくしてから再度お試しください。"
        );
      } else if (treasuryResult.status === "rejected") {
        setDisclosuresError(
          "自社株買いの集計データの取得に失敗しました。しばらくしてから再度お試しください。"
        );
      }
    } finally {
      setLoadingDisclosures(false);
    }
  }, []);

  const loadFilings = useCallback(async (watchList: WatchedCompany[]) => {
    if (watchList.length === 0) {
      setFilings([]);
      return;
    }
    setLoadingFilings(true);
    setFilingsError(null);
    try {
      const codes = watchList.map((c) => c.code);
      const snapshot = await fetchEdinetFilingsSnapshot();

      // Same permanent-merge approach as disclosures above: the snapshot
      // is only a rolling window, but once a filing has been seen it's
      // kept in this visitor's archive for good.
      const candidates = filterFilingsByCodes(snapshot.filings, codes);
      const added = mergeArchivedFilings(candidates);
      const addedIds = new Set(added.map((f) => f.docId));

      const archive = getArchivedFilings();
      const visible = filterFilingsByCodes(archive, codes)
        .map((f) => ({ ...f, isNew: addedIds.has(f.docId) }))
        .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());

      setFilings(visible);
      setFilingsGeneratedAt(snapshot.generatedAt);
    } catch {
      setFilingsError(
        "有価証券報告書等の取得に失敗しました。しばらくしてから再度お試しください。"
      );
    } finally {
      setLoadingFilings(false);
    }
  }, []);

  const loadAll = useCallback(
    (watchList: WatchedCompany[]) => {
      void loadDisclosures(watchList);
      void loadFilings(watchList);
    },
    [loadDisclosures, loadFilings]
  );

  useEffect(() => {
    // Defer to a microtask so these state updates (hydrating from
    // localStorage, which is only available client-side) don't run
    // synchronously within the effect body itself.
    queueMicrotask(() => {
      const initial = listWatchedCompanies();
      setCompanies(initial);
      setHydrated(true);
      // Always load — the treasury-stock summary spans every company and
      // doesn't depend on having anything registered (loadFilings is a
      // no-op internally when there's nothing on the watchlist yet).
      loadAll(initial);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep both feeds in sync with the server-side data while the tab is
  // open: poll periodically, and also refetch immediately whenever the
  // visitor switches back to this tab (covers the case where they were
  // away longer than the poll interval).
  useEffect(() => {
    function refresh() {
      loadAll(companiesRef.current);
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
  }, [loadAll]);

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
      loadAll(next);
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
    loadAll(next);
  }

  function handleDismissDisclosure(id: string) {
    dismissDisclosure(id);
    setDisclosures((prev) => prev.filter((d) => d.id !== id));
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-10">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">IR Watch</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          東証(TDnet)の適時開示情報をまとめて確認できます。登録銘柄の新着開示に加えて、全銘柄の自己株式取得(自社株買い)状況を集計した一覧も別タブで確認できます。登録内容はこの端末のブラウザ内にのみ保存され、他の人には見えません。
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
            onClick={() => loadAll(companies)}
            disabled={loadingDisclosures}
            className="text-sm text-zinc-500 hover:text-zinc-900 disabled:opacity-40 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            {loadingDisclosures ? "更新中..." : "更新"}
          </button>
        </div>

        {disclosuresError && (
          <p className="mt-3 text-sm text-red-600 dark:text-red-400">{disclosuresError}</p>
        )}

        {activeTab === "watchlist" ? (
          <>
            {snapshotGeneratedAt && (
              <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
                データ更新: {formatDate(snapshotGeneratedAt)}時点・一度表示された開示情報は削除するまで残ります
              </p>
            )}

            {!loadingDisclosures && disclosures.length === 0 && !disclosuresError ? (
              <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">
                {companies.length === 0
                  ? "銘柄を登録すると、ここに開示情報が表示されます。"
                  : "登録銘柄の開示情報はまだありません。"}
              </p>
            ) : (
              <ul className="mt-4 flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
                {disclosures.map((d) => (
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
          </>
        ) : (
          <>
            {treasurySummaryGeneratedAt && (
              <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
                データ更新: {formatDate(treasurySummaryGeneratedAt)}時点・数値はPDFから自動抽出した参考値です。取得できなかった項目は「—」と表示されます
              </p>
            )}

            {!loadingDisclosures && treasurySummary.length === 0 && !disclosuresError ? (
              <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">
                自己株式取得に関する集計データはまだありません。
              </p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead>
                    <tr className="text-xs text-zinc-500 dark:text-zinc-400">
                      <th className="pb-2 pr-3 font-medium">コード</th>
                      <th className="pb-2 pr-3 font-medium">銘柄名</th>
                      <th className="pb-2 pr-3 font-medium">総額(上限)</th>
                      <th className="pb-2 pr-3 font-medium">累計取得額</th>
                      <th className="pb-2 pr-3 font-medium">先月取得額</th>
                      <th className="pb-2 pr-3 font-medium">最終開示</th>
                      <th className="pb-2 font-medium" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                    {treasurySummary.map((row) => (
                      <tr key={row.code}>
                        <td className="py-2 pr-3 text-zinc-500 dark:text-zinc-400">{row.code}</td>
                        <td className="py-2 pr-3">{row.companyName}</td>
                        <td className="py-2 pr-3 whitespace-nowrap">
                          {formatYen(row.totalPlannedAmountYen)}
                        </td>
                        <td className="py-2 pr-3 whitespace-nowrap">
                          {formatYen(row.cumulativeAmountYen)}
                        </td>
                        <td className="py-2 pr-3 whitespace-nowrap">
                          {formatYen(row.lastMonthAmountYen)}
                        </td>
                        <td className="py-2 pr-3 whitespace-nowrap text-zinc-500 dark:text-zinc-400">
                          {formatDate(row.latestDisclosureAt)}
                        </td>
                        <td className="py-2">
                          <a
                            href={row.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs underline-offset-2 hover:underline"
                          >
                            詳細
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </section>

      <section className="flex-1">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">有価証券報告書・四半期/半期報告書</h2>
          <button
            type="button"
            onClick={() => loadAll(companies)}
            disabled={loadingFilings || companies.length === 0}
            className="text-sm text-zinc-500 hover:text-zinc-900 disabled:opacity-40 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            {loadingFilings ? "更新中..." : "更新"}
          </button>
        </div>

        <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
          EDINET(金融庁)に提出された書類の一覧です。提出から数日以内のものは主要な経営指標(売上高等)も表示されます。分析機能はまだ未実装です。
        </p>

        {filingsGeneratedAt && (
          <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
            データ更新: {formatDate(filingsGeneratedAt)}時点
          </p>
        )}

        {filingsError && (
          <p className="mt-3 text-sm text-red-600 dark:text-red-400">{filingsError}</p>
        )}

        {companies.length === 0 ? (
          <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">
            銘柄を登録すると、ここに提出書類が表示されます。
          </p>
        ) : !loadingFilings && filings.length === 0 && !filingsError && filingsGeneratedAt === null ? (
          <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">
            このデータはまだ準備中です(EDINET連携の設定待ち)。
          </p>
        ) : !loadingFilings && filings.length === 0 && !filingsError ? (
          <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">
            登録銘柄の提出書類はまだありません。
          </p>
        ) : (
          <ul className="mt-4 flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
            {filings.map((f) => (
              <li key={f.docId} className="flex flex-col gap-1 py-3">
                <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                  {f.isNew && (
                    <span className="rounded bg-emerald-100 px-1.5 py-0.5 font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">
                      NEW
                    </span>
                  )}
                  <span className="rounded bg-zinc-100 px-1.5 py-0.5 font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                    {f.docTypeLabel}
                  </span>
                  <span>{f.secCode}</span>
                  <span>{f.filerName}</span>
                  {f.periodStart && f.periodEnd && (
                    <span>
                      {f.periodStart} 〜 {f.periodEnd}
                    </span>
                  )}
                  <span>{formatDate(f.submittedAt)}</span>
                </div>
                {f.docDescription && (
                  <p className="text-sm font-medium">{f.docDescription}</p>
                )}
                {f.financials && f.financials.length > 0 && (
                  <div className="mt-1 overflow-x-auto">
                    <table className="text-xs">
                      <thead>
                        <tr className="text-zinc-400 dark:text-zinc-500">
                          <th className="pr-3 text-left font-normal">期間</th>
                          <th className="pr-3 text-left font-normal">区分</th>
                          <th className="pr-3 text-right font-normal">売上高</th>
                          <th className="pr-3 text-right font-normal">営業利益</th>
                          <th className="pr-3 text-right font-normal">経常利益</th>
                          <th className="pr-3 text-right font-normal">当期純利益</th>
                          <th className="text-right font-normal">EPS</th>
                        </tr>
                      </thead>
                      <tbody>
                        {f.financials.map((p, i) => (
                          <tr key={i}>
                            <td className="pr-3">{p.periodLabel}</td>
                            <td className="pr-3">{p.consolidated ? "連結" : "個別"}</td>
                            <td className="pr-3 text-right">{formatYen(p.netSales)}</td>
                            <td className="pr-3 text-right">{formatYen(p.operatingIncome)}</td>
                            <td className="pr-3 text-right">{formatYen(p.ordinaryIncome)}</td>
                            <td className="pr-3 text-right">{formatYen(p.profit)}</td>
                            <td className="text-right">{p.basicEarningsPerShare ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
