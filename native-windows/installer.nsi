Unicode true
!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "WordFunc.nsh"
!insertmacro WordFind
Name "DevForge Native Preview"
OutFile "@OUTPUT@"
InstallDir "$LOCALAPPDATA\Programs\DevForge Native Preview"
RequestExecutionLevel user
SetCompressor /SOLID lzma
Icon "@ICON@"
UninstallIcon "@ICON@"
VIProductVersion "0.8.0.1"
VIAddVersionKey "ProductName" "DevForge Native Preview"
VIAddVersionKey "FileDescription" "DevForge native Windows installer"
VIAddVersionKey "FileVersion" "0.8.0.1"
VIAddVersionKey "LegalCopyright" "DevForge contributors"
!define MUI_ABORTWARNING
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "Russian"
!insertmacro MUI_LANGUAGE "English"

Function .onInit
 SetRegView 64
 ReadRegStr $R0 HKLM "SOFTWARE\dotnet\Setup\InstalledVersions\x64" "InstallLocation"
 StrCmp $R0 "" 0 +2
 StrCpy $R0 "$PROGRAMFILES64\dotnet\"
 FindFirst $R1 $R2 "$R0\shared\Microsoft.WindowsDesktop.App\*"
 runtime_loop:
  StrCmp $R2 "" runtime_missing
  ${WordFind} "$R2" "." "+1" $R3
  IntCmp $R3 8 runtime_found runtime_next runtime_found
 runtime_next:
  FindNext $R1 $R2
  Goto runtime_loop
 runtime_missing:
  FindClose $R1
  MessageBox MB_OK "Для DevForge Native нужен .NET Desktop Runtime 8 или новее (x64). Установите его с dotnet.microsoft.com, затем повторите установку."
  SetErrorLevel 12
  Abort
 runtime_found:
  FindClose $R1
FunctionEnd

Function un.onInit
 SetRegView 64
FunctionEnd

Section "DevForge Native"
 SetOutPath "$INSTDIR"
 File /r "@STAGE@\*"
 WriteUninstaller "$INSTDIR\Uninstall.exe"
 CreateShortcut "$DESKTOP\DevForge Native Preview.lnk" "$INSTDIR\DevForge.Native.exe"
 CreateShortcut "$SMPROGRAMS\DevForge Native Preview.lnk" "$INSTDIR\DevForge.Native.exe"
 WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\DevForgeNativePreview" "DisplayName" "DevForge Native Preview"
 WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\DevForgeNativePreview" "DisplayVersion" "0.8.0-native.1"
 WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\DevForgeNativePreview" "UninstallString" '$\"$INSTDIR\Uninstall.exe$\"'
 WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\DevForgeNativePreview" "InstallLocation" "$INSTDIR"
SectionEnd

Section "Uninstall"
 Delete "$DESKTOP\DevForge Native Preview.lnk"
 Delete "$SMPROGRAMS\DevForge Native Preview.lnk"
 DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\DevForgeNativePreview"
@UNINSTALL_FILES@
SectionEnd
