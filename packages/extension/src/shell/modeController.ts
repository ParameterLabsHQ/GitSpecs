import * as vscode from "vscode";
import {
  MODE_PROFILES,
  captureModeSnapshot,
  isKnownMode,
  modeApplyPatches,
  modeRestorePatches,
  modeStatusBarText,
  toggleReviewMode,
  toggleZenMode,
  type GitSpecsModeId,
  type ModeSettingKey,
  type ModeSettingSnapshot,
} from "./modes.js";

const SNAPSHOT_KEY = "gitspecs.mode.restoreSnapshot";

/**
 * Applies/restores Zen/Review/Inspect profiles without permanently clobbering
 * user settings: snapshot is stored in workspaceState and restored on leave.
 */
export class ModeController implements vscode.Disposable {
  private readonly statusBar: vscode.StatusBarItem;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(private readonly context: vscode.ExtensionContext) {
    this.statusBar = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      90,
    );
    this.statusBar.name = "GitSpecs Mode";
    this.statusBar.command = "gitspecs.mode.switch";
    this.disposables.push(this.statusBar);

    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (
          e.affectsConfiguration("gitspecs.mode") ||
          e.affectsConfiguration("gitspecs.mode.statusBar")
        ) {
          this.refreshStatusBar();
        }
      }),
    );
    this.refreshStatusBar();
  }

  currentMode(): GitSpecsModeId {
    const raw = vscode.workspace.getConfiguration("gitspecs").get<string>("mode", "");
    if (raw && isKnownMode(raw)) return raw;
    return "";
  }

  async switchInteractive(): Promise<void> {
    const current = this.currentMode();
    const picks = [
      { label: "Normal (no mode)", id: "" as GitSpecsModeId },
      { label: "Zen", id: "zen" as const },
      { label: "Review", id: "review" as const },
      { label: "Inspect", id: "inspect" as const },
    ];
    const pick = await vscode.window.showQuickPick(
      picks.map((p) => ({
        ...p,
        description: p.id === current ? "(active)" : undefined,
      })),
      { title: "GitSpecs: Switch Mode" },
    );
    if (!pick) return;
    await this.setMode(pick.id);
  }

  async toggleZen(): Promise<void> {
    await this.setMode(toggleZenMode(this.currentMode()));
  }

  async toggleReview(): Promise<void> {
    await this.setMode(toggleReviewMode(this.currentMode()));
  }

  async setMode(next: GitSpecsModeId): Promise<void> {
    const current = this.currentMode();
    if (next === current) {
      this.refreshStatusBar();
      return;
    }

    const cfg = vscode.workspace.getConfiguration("gitspecs");

    // Leaving a mode → restore snapshot if present
    if (current && isKnownMode(current) && (!next || next !== current)) {
      const snap = this.context.workspaceState.get<ModeSettingSnapshot>(SNAPSHOT_KEY);
      if (snap) {
        for (const [key, value] of modeRestorePatches(snap)) {
          await this.updateSetting(key, value);
        }
        await this.context.workspaceState.update(SNAPSHOT_KEY, undefined);
      }
    }

    // Entering a mode → capture then apply
    if (next && isKnownMode(next)) {
      const profile = MODE_PROFILES[next];
      const snap = captureModeSnapshot((key) => {
        // Nested keys live under gitspecs configuration with dotted access
        return this.readSetting(key);
      }, profile);
      await this.context.workspaceState.update(SNAPSHOT_KEY, snap);
      for (const [key, value] of modeApplyPatches(profile)) {
        await this.updateSetting(key, value);
      }
    }

    await cfg.update("mode", next || "", vscode.ConfigurationTarget.Global);
    this.refreshStatusBar();
    const label = next && isKnownMode(next) ? MODE_PROFILES[next].label : "Normal";
    void vscode.window.setStatusBarMessage(`GitSpecs mode: ${label}`, 2500);
  }

  private readSetting(key: ModeSettingKey): boolean | string | undefined {
    const cfg = vscode.workspace.getConfiguration("gitspecs");
    // VS Code get supports dotted keys relative to the section
    return cfg.get<boolean | string>(key);
  }

  private async updateSetting(
    key: ModeSettingKey,
    value: boolean | string,
  ): Promise<void> {
    const cfg = vscode.workspace.getConfiguration("gitspecs");
    await cfg.update(key, value, vscode.ConfigurationTarget.Global);
  }

  private refreshStatusBar(): void {
    const show = vscode.workspace
      .getConfiguration("gitspecs")
      .get<boolean>("mode.statusBar", true);
    const mode = this.currentMode();
    const text = modeStatusBarText(mode);
    if (show && text) {
      this.statusBar.text = text;
      this.statusBar.tooltip = "GitSpecs: switch mode";
      this.statusBar.show();
    } else {
      this.statusBar.hide();
    }
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
  }
}

export function registerModeCommands(
  context: vscode.ExtensionContext,
  controller: ModeController,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("gitspecs.mode.switch", () =>
      controller.switchInteractive(),
    ),
    vscode.commands.registerCommand("gitspecs.mode.toggleZen", () =>
      controller.toggleZen(),
    ),
    vscode.commands.registerCommand("gitspecs.mode.toggleReview", () =>
      controller.toggleReview(),
    ),
  );
}
