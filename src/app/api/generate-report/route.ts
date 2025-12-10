
// This API route is not currently in use.
// It is a placeholder for any future server-side report generation logic.

import { NextResponse } from 'next/server';

export async function POST(request: Request) {
    return new NextResponse(
        JSON.stringify({ message: "This endpoint is not active." }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
    );
}
