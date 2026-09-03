"use client";

import { useCallback, useEffect, useState } from "react";
import {
  addWatchedCompany,
  dismissDisclosure,
  DuplicateCompanyError,
  getDismissedIds,
  getLastCheckedAt,
  listWatchedCompanies,
  pruneDismissedIds,
  removeWatchedCompany,
  setLastCheckedAt,
  type WatchedCompany,
} from "@/lib/watchlist";
import { fetchDisclosuresSnapshot, filterByCodes, type Disclosure } from "@/lib/tdnet";

type DisclosureItem = Disclosure & { isNew: boolean };

// TSE tickers are normally 4 digits, but JPX's newer alphanumeric codes
// (e.g. "130A") mix in letters too — accept either, case-insensitively.
const CODE_PATTERN = /^[0-9A-Za-z]{4}$/;

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

export default function Dashboard() {
  const [hydrated, setHydrated] = useState(false);
  const [companies, setCompanies] = useState<WatchedCompany[]>([]);
  const [disclosures, setDisclosures] = useState<DisclosureItem[]>([]);
  const [snapshotGeneratedAt, setSnapshotGeneratedAt] = useState<string | null>(null);
  const [loadingDisclosures, setLoadingDisclosures] = useState(false);
  const [disclosuresError, setDisclosuresError] = useState<string | null>(null);

  const [codeInput, setCodeInput] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const loadDisclosures = useCallback(async (watchList: WatchedCompany[]) => {
    if (watchList.length === 0) {
      setDisclosures([]);
      return;
    }
    setLoadingDisclosures(true);
    setDisclosuresError(null);
    try {
      const previousCheckedAt = getLastCheckedAt();
      const snapshot = await fetchDisclosuresSnapshot();
      pruneDismissedIds(snapshot.disclosures.map((d) => d.id));
      const dismissed = new Set(getDismissedIds());
      const filtered = filterByCodes(snapshot.disclosures, watchList.map((c) => c.code)).filter(
        (d) => !dismissed.has(d.id)
      );
      const withFlags = filtered
        .map((d) => ({
          ...d,
          isNew: previousCheckedAt ? new Date(d.publishedAt) > previousCheckedAt : true,
        }))
        .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
      setDisclosures(withFlags);
      setSnapshotGeneratedAt(snapshot.generatedAt);
      setLastCheckedAt(new Date());
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
      if (initial.length > 0) {
        void loadDisclosures(initial);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-10">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">IR Watch</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          東証(TDnet)の適時開示情報から、登録した銘柄の新着開示をまとめて確認できます。登録内容はこの端末のブラウザ内にのみ保存され、他の人には見えません。
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
          <h2 className="text-lg font-medium">新着開示</h2>
          <button
            type="button"
            onClick={() => void loadDisclosures(companies)}
            disabled={loadingDisclosures || companies.length === 0}
            className="text-sm text-zinc-500 hover:text-zinc-900 disabled:opacity-40 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            {loadingDisclosures ? "更新中..." : "更新"}
          </button>
        </div>

        {snapshotGeneratedAt && (
          <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
            データ更新: {formatDate(snapshotGeneratedAt)}時点
          </p>
        )}

        {disclosuresError && (
          <p className="mt-3 text-sm text-red-600 dark:text-red-400">{disclosuresError}</p>
        )}

        {companies.length === 0 ? (
          <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">
            銘柄を登録すると、ここに開示情報が表示されます。
          </p>
        ) : !loadingDisclosures && disclosures.length === 0 && !disclosuresError ? (
          <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">
            直近の開示情報は見つかりませんでした。
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
      </section>
    </div>
  );
}
