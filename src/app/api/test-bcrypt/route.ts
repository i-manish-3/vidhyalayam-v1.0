import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";

export async function GET() {
  try {
    const hash = bcrypt.hashSync("test123", 4);
    const valid = bcrypt.compareSync("test123", hash);
    return NextResponse.json({ hash: hash.substring(0, 20) + "...", valid });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
