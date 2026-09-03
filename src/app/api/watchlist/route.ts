import { NextResponse } from "next/server";
import { getUserId } from "@/lib/session";
import {
  addWatchedCompany,
  DuplicateCompanyError,
  listWatchedCompanies,
} from "@/lib/watchlist";

const CODE_PATTERN = /^[0-9]{4}$/;

export async function GET() {
  const userId = await getUserId();
  const companies = listWatchedCompanies(userId);
  return NextResponse.json({ companies });
}

export async function POST(request: Request) {
  const userId = await getUserId();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { code, name } = (body ?? {}) as { code?: unknown; name?: unknown };

  if (typeof code !== "string" || !CODE_PATTERN.test(code.trim())) {
    return NextResponse.json(
      { error: "証券コードは4桁の数字で入力してください" },
      { status: 400 }
    );
  }
  if (typeof name !== "string" || name.trim().length === 0 || name.trim().length > 100) {
    return NextResponse.json(
      { error: "会社名を入力してください(100文字以内)" },
      { status: 400 }
    );
  }

  try {
    const company = addWatchedCompany(userId, code.trim(), name.trim());
    return NextResponse.json({ company }, { status: 201 });
  } catch (err) {
    if (err instanceof DuplicateCompanyError) {
      return NextResponse.json(
        { error: "既に登録済みの銘柄です" },
        { status: 409 }
      );
    }
    throw err;
  }
}
