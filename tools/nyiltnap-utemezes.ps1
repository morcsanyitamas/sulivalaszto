# A helyi nyíltnap-kereső felvétele a Windows Feladatütemezőbe (egyszer kell lefuttatni).
#
#   powershell -ExecutionPolicy Bypass -File tools\nyiltnap-utemezes.ps1            – naponta 7:30-kor
#   powershell -ExecutionPolicy Bypass -File tools\nyiltnap-utemezes.ps1 -At 19:00
#   powershell -ExecutionPolicy Bypass -File tools\nyiltnap-utemezes.ps1 -Remove     – törlés
#
# Ha a gép a megadott időben ki van kapcsolva vagy alszik, a következő indításkor pótolja.
# Napló: %LOCALAPPDATA%\sulivalaszto-nyiltnap.log

param(
  [string]$At = "07:30",
  [switch]$Remove
)

$Name = "Suliválasztó nyíltnap-kereső"

if ($Remove) {
  Unregister-ScheduledTask -TaskName $Name -Confirm:$false
  Write-Host "Törölve: $Name"
  return
}

$script = Join-Path $PSScriptRoot "nyiltnap-helyi.ps1"
$action = New-ScheduledTaskAction -Execute "powershell.exe" `
  -Argument "-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$script`""
$trigger = New-ScheduledTaskTrigger -Daily -At $At
$set = New-ScheduledTaskSettingsSet -StartWhenAvailable -RunOnlyIfNetworkAvailable `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 30) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName $Name -Action $action -Trigger $trigger -Settings $set `
  -Description "Átnézi az iskolák honlapját, és frissíti a nyiltnap.json-t a GitHubon (sulivalaszto)." -Force | Out-Null
Write-Host "Ütemezve: $Name – naponta $At (a gép indulásakor pótolja, ha elmaradt)."
