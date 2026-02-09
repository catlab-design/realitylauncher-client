; ========================================
; Reality Launcher - Custom Installer Pages
; ========================================
; Adds initial setup options:
;   1. UI Sound Effects (on/off)
;   2. Default Language (English/Thai)

!include "nsDialogs.nsh"
!include "LogicLib.nsh"
!include "WinMessages.nsh"

; Variables for custom page controls
!ifndef BUILD_UNINSTALLER
  Var Dialog
  Var SoundCheckbox
  Var SoundCheckboxState
  Var LangEnRadio
  Var LangThRadio
  Var SelectedLang
!endif

; ========================================
; Initialize defaults
; ========================================
!macro customInit
  StrCpy $SoundCheckboxState ${BST_CHECKED}
  StrCpy $SelectedLang "en"
!macroend

; ========================================
; Custom Page Definition (installer only)
; ========================================
!macro customPageAfterChangeDir
  !ifndef BUILD_UNINSTALLER
    Page custom InitialSettingsPage InitialSettingsPageLeave
  !endif
!macroend

; ========================================
; Custom Install - Write config.json
; ========================================
!macro customInstall
  SetShellVarContext current
  CreateDirectory "$APPDATA\RealityLauncher"

  ; Determine sound setting
  ${If} $SoundCheckboxState == ${BST_CHECKED}
    StrCpy $0 "true"
  ${Else}
    StrCpy $0 "false"
  ${EndIf}

  ; Only write config if it doesn't already exist (fresh install)
  IfFileExists "$APPDATA\RealityLauncher\config.json" skipConfigWrite 0

  FileOpen $1 "$APPDATA\RealityLauncher\config.json" w
  FileWrite $1 '{$\r$\n'
  FileWrite $1 '  "theme": "light",$\r$\n'
  FileWrite $1 '  "colorTheme": "yellow",$\r$\n'
  FileWrite $1 '  "language": "$SelectedLang",$\r$\n'
  FileWrite $1 '  "selectedVersion": "",$\r$\n'
  FileWrite $1 '  "minRamMB": 2048,$\r$\n'
  FileWrite $1 '  "ramMB": 4096,$\r$\n'
  FileWrite $1 '  "javaPath": "",$\r$\n'
  FileWrite $1 '  "javaArguments": "",$\r$\n'
  FileWrite $1 '  "maxConcurrentDownloads": 5,$\r$\n'
  FileWrite $1 '  "downloadSpeedLimit": 0,$\r$\n'
  FileWrite $1 '  "windowAutoSize": true,$\r$\n'
  FileWrite $1 '  "windowWidth": 1100,$\r$\n'
  FileWrite $1 '  "windowHeight": 680,$\r$\n'
  FileWrite $1 '  "discordRPCEnabled": true,$\r$\n'
  FileWrite $1 '  "telemetryEnabled": true,$\r$\n'
  FileWrite $1 '  "autoUpdateEnabled": true,$\r$\n'
  FileWrite $1 '  "clickSoundEnabled": $0,$\r$\n'
  FileWrite $1 '  "notificationSoundEnabled": $0,$\r$\n'
  FileWrite $1 '  "rainbowMode": false,$\r$\n'
  FileWrite $1 '  "closeOnLaunch": "keep-open"$\r$\n'
  FileWrite $1 '}$\r$\n'
  FileClose $1

  skipConfigWrite:
!macroend

; ========================================
; Page Functions (installer only, not uninstaller)
; ========================================
!ifndef BUILD_UNINSTALLER

Function InitialSettingsPage
  ; Set header text via hwnd
  GetDlgItem $0 $HWNDPARENT 1037
  SendMessage $0 ${WM_SETTEXT} 0 "STR:Initial Settings"
  GetDlgItem $0 $HWNDPARENT 1038
  SendMessage $0 ${WM_SETTEXT} 0 "STR:Choose your preferred settings for Reality Launcher."

  nsDialogs::Create 1018
  Pop $Dialog
  ${If} $Dialog == error
    Abort
  ${EndIf}

  ; ========== Sound Section ==========
  ${NSD_CreateGroupBox} 0 0u 100% 44u "Sound Effects"
  Pop $0

  ${NSD_CreateLabel} 15u 10u 90% 14u "Enable UI sound effects (button clicks, notifications)"
  Pop $0

  ${NSD_CreateCheckbox} 15u 26u 90% 14u "Enable sound effects"
  Pop $SoundCheckbox
  ${NSD_SetState} $SoundCheckbox $SoundCheckboxState

  ; ========== Language Section ==========
  ${NSD_CreateGroupBox} 0 54u 100% 64u "Default Language"
  Pop $0

  ${NSD_CreateLabel} 15u 68u 90% 14u "Choose the default display language"
  Pop $0

  ${NSD_CreateRadioButton} 15u 86u 45% 14u "English"
  Pop $LangEnRadio

  ${NSD_CreateRadioButton} 15u 102u 45% 14u "Thai"
  Pop $LangThRadio

  ; Set default selection
  ${If} $SelectedLang == "th"
    ${NSD_SetState} $LangThRadio ${BST_CHECKED}
    ${NSD_SetState} $LangEnRadio ${BST_UNCHECKED}
  ${Else}
    ${NSD_SetState} $LangEnRadio ${BST_CHECKED}
    ${NSD_SetState} $LangThRadio ${BST_UNCHECKED}
  ${EndIf}

  ${NSD_CreateLabel} 15u 120u 90% 12u "You can change this later in Settings."
  Pop $0
  SetCtlColors $0 888888 transparent

  nsDialogs::Show
FunctionEnd

Function InitialSettingsPageLeave
  ${NSD_GetState} $SoundCheckbox $SoundCheckboxState

  ${NSD_GetState} $LangEnRadio $0
  ${If} $0 == ${BST_CHECKED}
    StrCpy $SelectedLang "en"
  ${Else}
    StrCpy $SelectedLang "th"
  ${EndIf}
FunctionEnd

!endif ; BUILD_UNINSTALLER
