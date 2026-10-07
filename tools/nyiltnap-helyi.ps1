# Nyíltnap-kereső helyi gépről, a GitHub Actions mellett.
# Néhány iskolai honlap a GitHub szervereiről nem érhető el, magyar otthoni netről igen –
# ezért érdemes itt is lefuttatni. Külön klónban dolgozik (alapból
# %LOCALAPPDATA%\sulivalaszto-nyiltnap), így a fejlesztői munkapéldányhoz nem nyúl.
#
#   powershell -ExecutionPolicy Bypass -File tools\nyiltnap-helyi.ps1           – futtatás + push
#   powershell -ExecutionPolicy Bypass -File tools\nyiltnap-helyi.ps1 -NoPush   – csak helyi commit
#
# Ütemezéshez lásd: tools\nyiltnap-utemezes.ps1

param(
  [switch]$NoPush,
  [string]$Dir = (Join-Path $env:LOCALAPPDATA "sulivalaszto-nyiltnap")
)

$ErrorActionPreference = "Stop"
$Log = "$Dir.log"
$Repo = Split-Path -Parent $PSScriptRoot

function Log([string]$msg) {
  $line = "{0:yyyy-MM-dd HH:mm:ss}  {1}" -f (Get-Date), $msg
  Add-Content -Path $Log -Value $line -Encoding UTF8
  Write-Host $line
}
# Natív parancs futtatása cmd-n át, hogy a stderr is a naplóba kerüljön (PowerShell 5.1-ben
# a közvetlen 2>&1 hibának jelölné), UTF-8 kódlappal az ékezetek miatt.
function Run([string]$cmd) {
  $prev = [Console]::OutputEncoding
  [Console]::OutputEncoding = [Text.Encoding]::UTF8
  try {
    $out = & cmd /c "chcp 65001 >nul & $cmd 2>&1"
    $code = $LASTEXITCODE
  } finally { [Console]::OutputEncoding = $prev }
  if ($out) { $out | ForEach-Object { Add-Content -Path $Log -Value "    $_" -Encoding UTF8 } }
  return $code
}

# a napló ne nőjön a végtelenségig
if ((Test-Path $Log) -and (Get-Item $Log).Length -gt 1MB) {
  Get-Content $Log -Tail 3000 -Encoding UTF8 | Set-Content "$Log.tmp" -Encoding UTF8
  Move-Item -Force "$Log.tmp" $Log
}

Log "=== indul ($env:COMPUTERNAME) ==="
try {
  if (-not (Test-Path (Join-Path $Dir ".git"))) {
    $url = (& git -C $Repo remote get-url origin).Trim()
    Log "klónozás: $url -> $Dir"
    if ((Run "git clone -q `"$url`" `"$Dir`"") -ne 0) { throw "a klónozás nem sikerült" }
  }
  Set-Location $Dir
  # A klón csak erre való: mindig a GitHubon lévő állapotból indulunk.
  if ((Run "git fetch -q origin main") -ne 0) { throw "git fetch nem sikerült" }
  Run "git reset -q --hard origin/main" | Out-Null

  if ((Run "node tools/nyiltnap.mjs") -ne 0) { throw "a nyíltnap-kereső hibával állt le" }

  Run "git add nyiltnap.json" | Out-Null
  if ((Run "git diff --cached --quiet") -eq 0) { Log "nincs változás"; return }

  $msgFile = Join-Path $Dir ".git\NYILTNAP_MSG"
  [IO.File]::WriteAllText($msgFile, "nyíltnap-kereső (helyi gép): {0:yyyy-MM-dd}`n" -f (Get-Date), (New-Object Text.UTF8Encoding $false))
  Run "git -c user.name=nyiltnap-helyi -c user.email=nyiltnap-helyi@localhost commit -q -F `"$msgFile`"" | Out-Null
  if ($NoPush) { Log "commit kész, push kihagyva (-NoPush)"; return }

  # Ha közben a GitHub Actions is pusholt, a mi frissebb futásunk nyer a nyiltnap.json-ban.
  for ($i = 1; $i -le 3; $i++) {
    if ((Run "git push -q origin HEAD:main") -eq 0) { Log "push kész"; return }
    Log "push elutasítva, újrapróbálás ($i)"
    Run "git pull -q --rebase -X theirs origin main" | Out-Null
  }
  throw "a push háromszor sem sikerült"
} catch {
  Log "HIBA: $($_.Exception.Message)"
  exit 1
}
