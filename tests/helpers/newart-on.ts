// Turns the new-art preview on for a test (newart.ts reads ?newart from the location when it loads): import this first.
(globalThis as { location?: { search: string } }).location = { search: '?newart' };
