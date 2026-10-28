package dev.forge.ide;

/** Exact workspace trust; reading/editing files remains available in restricted mode. */
final class WorkspaceTrustPolicy {
    static boolean executesProject(String operation) {
        return operation.equals("pythonCheck")||operation.equals("pythonRun")||operation.equals("notebookStart")||operation.equals("notebookExecute")||operation.equals("build")||operation.equals("cmakeConfigure")||operation.equals("run")||operation.equals("runCommand")||operation.equals("shell")||operation.equals("git")||operation.equals("lspStart")||operation.equals("lspSend")||operation.equals("formatDocument")||operation.equals("formatterRange")||operation.equals("formatterOnType")||operation.startsWith("gdb")&&!operation.equals("gdbStop");
    }
}
