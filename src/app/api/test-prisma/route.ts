import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const count = await db.user.count();
    const user = await db.user.findFirst({ select: { name: true, email: true } });
    return NextResponse.json({ count, firstUser: user });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
