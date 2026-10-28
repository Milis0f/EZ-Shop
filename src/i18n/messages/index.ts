import type { Locale } from "../config";
import * as ai from "./ai";
import * as analysisAdvanced from "./analysis-advanced";
import * as common from "./common";
import * as connectors from "./connectors";
import * as country from "./country";
import * as home from "./home";
import * as methodology from "./methodology";
import * as report from "./report";
import * as serverMessages from "./server-messages";
import * as shell from "./shell";
import type { DeepStringShape } from "./types";

/** Every dictionary, by area. One file per area so parallel work never touches the same file. */
export const MESSAGES = {
  common,
  shell,
  home,
  report,
  analysisAdvanced,
  country,
  connectors,
  methodology,
  ai,
  serverMessages,
} as const;

export type Area = keyof typeof MESSAGES;

/** The strings of one area, as a component sees them (keys of the English source, string leaves). */
export type Messages<A extends Area> = DeepStringShape<(typeof MESSAGES)[A]["en"]>;

export function messagesFor<A extends Area>(area: A, locale: Locale): Messages<A> {
  return MESSAGES[area][locale] as Messages<A>;
}
