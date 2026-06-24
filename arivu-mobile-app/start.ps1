param([switch]$Lan)

# Arivu — run with all caches on G: drive only
$env:npm_config_cache = "G:\ARIVU-APP\.npm-cache"
$env:TEMP = "G:\ARIVU-APP\.temp"
$env:TMP = "G:\ARIVU-APP\.temp"
$env:EXPO_HOME = "G:\ARIVU-APP\.expo-home"
$env:METRO_CACHE = "G:\ARIVU-APP\.metro-cache"

# Expo tries to run `adb reverse` when it finds an Android SDK folder.
# If platform-tools/adb.exe is missing, tunnel mode crashes with ENOENT.
$defaultSdk = Join-Path $env:LOCALAPPDATA "Android\Sdk"
$adbPath = Join-Path $defaultSdk "platform-tools\adb.exe"
if (-not (Test-Path $adbPath)) {
  $env:ANDROID_HOME = "G:\ARIVU-APP\.no-adb"
  $env:ANDROID_SDK_ROOT = "G:\ARIVU-APP\.no-adb"
}

Set-Location $PSScriptRoot

# Tunnel: phone reaches PC via the internet (fixes hotspot / guest Wi-Fi issues).
# Use -Lan when phone and PC share the same home Wi-Fi for faster reloads.
if ($Lan) {
  npx expo start
} else {
  npx expo start --tunnel
}
