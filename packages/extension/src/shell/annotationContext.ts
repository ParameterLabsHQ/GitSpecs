import * as vscode from "vscode";

/** Context key for Escape → dismiss when any annotation mode is active. */
export const ANNOTATIONS_ACTIVE_CONTEXT_KEY = "gitspecs.annotations.active";

/**
 * Tracks file-blame and changes-annotation modes so keybindings can use a
 * non-contradictory `when` clause (`gitspecs.annotations.active`).
 */
export class AnnotationModeState {
  private fileBlame = false;
  private changes = false;

  async setFileBlame(on: boolean): Promise<void> {
    this.fileBlame = on;
    await this.sync();
  }

  async setChanges(on: boolean): Promise<void> {
    this.changes = on;
    await this.sync();
  }

  get isActive(): boolean {
    return this.fileBlame || this.changes;
  }

  private async sync(): Promise<void> {
    await vscode.commands.executeCommand(
      "setContext",
      ANNOTATIONS_ACTIVE_CONTEXT_KEY,
      this.isActive,
    );
  }
}
