package dev.forge.ide;
public final class WorkspaceTrustPolicyTest {
 public static void main(String[] args){int count=0;for(String op:new String[]{"pythonCheck","pythonRun","notebookStart","notebookExecute","build","cmakeConfigure","run","runCommand","shell","git","lspStart","lspSend","formatDocument","formatterOnType","gdbStart","gdbSend"}){if(!WorkspaceTrustPolicy.executesProject(op))throw new AssertionError(op);count++;}for(String op:new String[]{"state","read","write","tree","stop","gdbStop","lspStop","addonLibrary","toolPacks","workspaceTrust","workspaceTrustSet","notebookStop","pythonInfo"}){if(WorkspaceTrustPolicy.executesProject(op))throw new AssertionError(op);count++;}System.out.println(count+" workspace trust policy checks passed");}
}
