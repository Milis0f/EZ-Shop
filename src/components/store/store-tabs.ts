/** The sections of "My store", in the order of its tabs. Plain module: the page (server) and the dashboard (client) both read it. */
export const TABS = ["overview", "traffic", "market", "social", "payments", "advice", "products", "countries", "ads", "connect"] as const;
export type Tab = (typeof TABS)[number];
