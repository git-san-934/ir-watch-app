"use client";

import { useCallback, useEffect, useState } from "react";
import type { WatchedCompany } from "@/lib/watchlist";
import type { Disclosure } from "@/lib/tdnet";

type DisclosureItem = Disclosure & { isNew: boolean };

interface Props {
  initialCompanies: WatchedCompany[];
}

const CODE_PATTERN = /^[0-9]{4}$/;

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

export default function Dashboard({ initialCompanies }: Props) {
  const [companies, setCompanies] = useState<WatchedCompany[]>(initialCompanies);
  const [disclosures, setDisclosures] = useState<DisclosureItem[]>([]);
  const [loadingDisclosures, setLoadingDisclosures] = useState(false);
  const [disclosuresError, setDisclosuresError] = useState<string | null>(null);

  const [codeInput, setCodeInput] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadDisclosures = useCallback(async () => {
    setLoadingDisclosures(true);
    setDisclosuresError(null);
    try {
      const res = await fetch("/api/disclosures");
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "開示情報の取得に失敗しました");
      }
      setDisclosures(data.disclosures);
    } catch (err) {
      setDisclosuresError(err instanceof Error ? err.message : "開示情報の取得に失敗しました");
    } finally {
      setLoadingDisclosures(false);
    }
  }, []);

  useEffect(() => {
    if (companies.length === 0) return;
    // Defer to a microtask so the fetch's state updates don't run
    // synchronously within the effect body itself.
    queueMicrotask(() => {
      void loadDisclosures();
    });
  }, [companies.length, loadDisclosures]);

  async function handleAddCompany(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    const code = codeInput.trim();
    const name = nameInput.trim();

    if (!CODE_PATTERN.test(code)) {
      setFormError("証券コードは4桁の数字で入力してください");
      return;
    }
    if (!name) {
      setFormError("会社名を入力してください");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, name }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "登録に失敗しました");
      }
      setCompanies((prev) => [...prev, data.company]);
      setCodeInput("");
      setNameInput("");
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "登録に失敗しました");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRemoveCompany(id: string) {
    const previous = companies;
    setCompanies((prev) => prev.filter((c) => c.id !== id));
    try {
      const res = await fetch(`/api/watchlist/${id}`, { method: "DELETE" });
      if (!res.ok) {
        throw new Error();
      }
    } catch {
      setCompanies(previous);
    }
  }

  const watchedCodes = new Set(companies.map((c) => c.code));

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-10">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">IR Watch</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          東証(TDnet)の適時開示情報から、登録した銘柄の新着開示をまとめて確認できます。
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
              onChange={(e) => setCodeInput(e.target.value)}
              placeholder="7203"
              inputMode="numeric"
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
            disabled={submitting}
            className="mt-5 rounded-md bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            追加
          </button>
        </form>
        {formError && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{formError}</p>}

        {companies.length === 0 ? (
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
            onClick={() => void loadDisclosures()}
            disabled={loadingDisclosures || watchedCodes.size === 0}
            className="text-sm text-zinc-500 hover:text-zinc-900 disabled:opacity-40 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            {loadingDisclosures ? "更新中..." : "更新"}
          </button>
        </div>

        {disclosuresError && (
          <p className="mt-3 text-sm text-red-600 dark:text-red-400">{disclosuresError}</p>
        )}

        {watchedCodes.size === 0 ? (
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
              <li key={d.id} className="flex flex-col gap-1 py-3">
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
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
