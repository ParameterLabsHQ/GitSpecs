import * as vscode from "vscode";

export class PlatformLog {
  private readonly channel: vscode.OutputChannel;

  constructor() {
    this.channel = vscode.window.createOutputChannel("Git Platform");
  }

  dispose(): void {
    this.channel.dispose();
  }

  show(): void {
    this.channel.show(true);
  }

  info(message: string): void {
    this.channel.appendLine(`[info] ${message}`);
  }

  error(message: string): void {
    this.channel.appendLine(`[error] ${message}`);
  }

  debug(message: string): void {
    const verbosity = vscode.workspace
      .getConfiguration("gitPlatform")
      .get<string>("log.verbosity", "info");
    if (verbosity === "debug") {
      this.channel.appendLine(`[debug] ${message}`);
    }
  }

  git(args: string[], code: number, stderr: string): void {
    this.channel.appendLine(`[git] git ${args.join(" ")} → ${code}`);
    if (stderr.trim()) {
      this.channel.appendLine(stderr.trim());
    }
  }
}
