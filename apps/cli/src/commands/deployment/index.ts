import { Command } from "commander";
import type { CommandContext } from "../../types.js";
import { loadCliState, parsedArgs, type SetExitCode } from "../shared.js";
import { runDriverCommand } from "./action.js";

type DriverCommand = "up" | "down" | "logs" | "ps";

const descriptions: Record<DriverCommand, string> = {
    up: "Start the selected Compose deployment",
    down: "Stop the selected Compose deployment",
    logs: "Stream logs for the selected deployment",
    ps: "List the running containers or pods for the selected deployment",
};

// Commands that act on a single workload rather than the whole deployment.
const serviceScoped: ReadonlySet<DriverCommand> = new Set(["logs"]);

export function createDeploymentCommands(
    context: CommandContext,
    setExitCode: SetExitCode,
): Command[] {
    return (["up", "down", "logs", "ps"] as const).map((name) => {
        const command = new Command(name)
            .description(descriptions[name])
            .argument(
                "[args...]",
                "additional arguments passed to the deployment runtime",
            )
            .option("--instance <name>", "select a configured instance");
        if (serviceScoped.has(name)) {
            command
                .option(
                    "--service <name>",
                    "select a configured workload (Kubernetes instances)",
                )
                .option("--follow", "stream new output as it arrives")
                .option("--tail <lines>", "number of recent lines to show");
        }
        return command.action(async (args, options) => {
                const { config } = await loadCliState(context);
                setExitCode(
                    await runDriverCommand(
                        config,
                        name,
                        parsedArgs(name, undefined, args, options),
                        context,
                    ),
                );
        });
    });
}
