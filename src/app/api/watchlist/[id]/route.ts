import { NextResponse } from "next/server";
import { getUserId } from "@/lib/session";
import { removeWatchedCompany } from "@/lib/watchlist";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId();
  const { id } = await params;

  const removed = removeWatchedCompany(userId, id);
  if (!removed) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
