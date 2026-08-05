import * as vscode from "vscode";
import { normalizeAutolinkRules, type AutolinkRule } from "./format.js";

/** Read `gitspecs.autolinks` from workspace configuration. */
export function readAutolinkRules(): AutolinkRule[] {
  const raw = vscode.workspace.getConfiguration("gitspecs").get("autolinks");
  return normalizeAutolinkRules(raw);
}
