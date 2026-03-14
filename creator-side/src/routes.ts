export type RouteEntry = { route: string; file: string };

// Keep this list in sync with actual files under `public/pages`.
// At the moment there are no HTML snapshot files checked in.
export const ROUTES: RouteEntry[] = [];

export const ROUTE_MAP: Record<string, string> = Object.fromEntries(
  ROUTES.map((entry) => [entry.route, entry.file])
);
