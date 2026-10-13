param([string]$TaskId)
$ErrorActionPreference = 'Stop'
if ($TaskId -notmatch '^[a-f0-9-]{36}$') { throw 'INVALID_CANDIDATE_ID' }
$candidateMutex = New-Object System.Threading.Mutex($false, "Local\WebsiteVerificationCandidate-$TaskId")
$candidateAcquired = $false
try {
  try { $candidateAcquired = $candidateMutex.WaitOne(0) }
  catch [System.Threading.AbandonedMutexException] { $candidateAcquired = $true }
  if (-not $candidateAcquired) { [Console]::WriteLine('{"locked":false}'); exit 3 }
  [Console]::WriteLine('{"locked":true}')
  [Console]::Out.Flush()
  # EOF releases the mutex when the owning Node process closes or exits.
  [void][Console]::In.ReadToEnd()
} finally {
  if ($candidateAcquired) { $candidateMutex.ReleaseMutex() }
  $candidateMutex.Dispose()
}
