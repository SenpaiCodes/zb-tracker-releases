; Extra NSIS steps for Z&B Tracker.
;
; The previous release shipped as "Tape & Ledger" under a different appId, so
; electron-builder's own upgrade path does not see it. Find its uninstaller and
; run it silently before installing. Journals live in %APPDATA% and are never
; touched by either uninstaller — `deleteAppDataOnUninstall` is false, and the
; app migrates the old folder on first run.

!macro customInit
  ; Per-user install (HKCU) is what the old one-click build wrote.
  ReadRegStr $R9 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\com.tapeledger.journal" "QuietUninstallString"
  ${If} $R9 == ""
    ReadRegStr $R9 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\com.tapeledger.journal" "UninstallString"
    ${If} $R9 != ""
      StrCpy $R9 "$R9 /S"
    ${EndIf}
  ${EndIf}

  ; Fall back to a machine-wide install if someone ran it elevated.
  ${If} $R9 == ""
    ReadRegStr $R9 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\com.tapeledger.journal" "QuietUninstallString"
  ${EndIf}

  ${If} $R9 != ""
    DetailPrint "Removing the previous Tape & Ledger installation..."
    ; Failure here must not block the install; the old copy simply stays.
    ClearErrors
    ExecWait '$R9' $R8
  ${EndIf}
!macroend
