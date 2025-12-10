// This worker is no longer used and is obsolete.
// The DOCX generation logic has been moved to the server-side API route
// at `src/app/api/generate-report/route.ts`.
// This file can be safely removed.

self.onmessage = () => {
    self.postMessage({ ok: false, error: "This worker is obsolete." });
};

export {};
