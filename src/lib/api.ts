import { NextResponse } from "next/server";

export type ApiResponse<T> = {
  data: T | null;
  error: string | null;
};

export function apiSuccess<T>(data: T, status = 200) {
  return NextResponse.json({ data, error: null } satisfies ApiResponse<T>, { status });
}

export function apiError(message: string, status = 400) {
  return NextResponse.json({ data: null, error: message } satisfies ApiResponse<null>, { status });
}
