// This file is no longer used for client-side PDF generation.
// The logic has been moved directly into `src/components/tabs/report-tab.tsx`.
// This server-side route could be repurposed for archival or other server-side tasks in the future.

import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    // This route is now a placeholder.
    console.warn("The /api/generate-report endpoint was called, but is currently a placeholder. PDF generation is handled on the client.");
    
    return new NextResponse(JSON.stringify({ message: "This endpoint is a placeholder. PDF generation is now handled on the client." }), {
      status: 404,
      headers: {
        'Content-Type': 'application/json',
      },
    });

  } catch (error: any) {
    console.error('Error in placeholder report route:', error);
    return new NextResponse(`Error: ${error.message}`, { status: 500 });
  }
}
