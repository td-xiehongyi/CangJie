param([string]$Model = '', [string]$TaskId = '')
$ErrorActionPreference = 'Stop'
$pilotRoot = Split-Path -Parent $PSScriptRoot
Push-Location -LiteralPath $pilotRoot
try {
  if (-not (Test-Path -LiteralPath 'apps/host/dist/model/candidate.js')) { throw '请先运行 npm run check' }
  Write-Host 'T4 真实候选验证：仅发送下列已公开规则、能力说明、通用格式与通用诊断。'
  Write-Host '服务：https://api.deepseek.com；不会上传项目源码、完整模板、测试答案、数据库或凭据。'
  Write-Host '本机目标副本仅使用两个合成账号。最多 8 次调用，最多 2 次自动修订。'
  $pilotDisclosure = & node scripts/t4-live.mjs --disclose
  if ($LASTEXITCODE -ne 0) { throw '本地发送范围检查失败' }
  ($pilotDisclosure | ConvertFrom-Json).publicContext | ConvertTo-Json -Depth 12 | Write-Host
  if ((Read-Host '确认发送这个范围并运行本地目标副本？输入 YES') -cne 'YES') { throw '发送未确认' }
  if (-not $Model) { $Model = Read-Host '输入本次使用的模型名称（无默认值）' }
  if (-not $Model -or $Model -cne $Model.Trim()) { throw '必须输入准确的模型名称' }
  $pilotRemember = (Read-Host '将 API Key 记到 Windows 凭据管理器？默认不记住，输入 YES 才记住') -ceq 'YES'
  $pilotSecureKey = Read-Host '输入此项目的 DeepSeek API Key（隐藏输入，请勿发到聊天）' -AsSecureString
  $pilotKeyPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($pilotSecureKey)
  try {
    $pilotInput = @{ model=$Model; key=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($pilotKeyPointer); confirmed=$true; remember=$pilotRemember; taskId=$TaskId } | ConvertTo-Json -Compress
    $pilotInput | & node scripts/t4-live.mjs
    $pilotInput = $null
    if ($LASTEXITCODE -ne 0) { Write-Host '本轮未达到审核就绪。保留了任务与预算，请把上方 taskId 和状态发回聊天；不要发送 API Key。' }
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pilotKeyPointer)
    $pilotSecureKey.Dispose()
    $pilotInput = $null
  }
} finally { Pop-Location }
