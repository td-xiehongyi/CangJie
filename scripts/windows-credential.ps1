$ErrorActionPreference = 'Stop'
$credentialRequest = [Console]::In.ReadToEnd() | ConvertFrom-Json
if ($credentialRequest.target -notmatch '^website-verification/model/[a-f0-9-]{36}$') { throw 'INVALID_CREDENTIAL_TARGET' }
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.ComponentModel;
public static class VerificationCredential {
 [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] public struct CREDENTIAL {
  public uint Flags; public uint Type; public string TargetName; public string Comment;
  public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
  public uint CredentialBlobSize; public IntPtr CredentialBlob; public uint Persist;
  public uint AttributeCount; public IntPtr Attributes; public string TargetAlias; public string UserName;
 }
 [DllImport("advapi32.dll",EntryPoint="CredWriteW",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool Write(ref CREDENTIAL value,uint flags);
 [DllImport("advapi32.dll",EntryPoint="CredReadW",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool Read(string target,uint type,uint flags,out IntPtr value);
 [DllImport("advapi32.dll",EntryPoint="CredDeleteW",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool Delete(string target,uint type,uint flags);
 [DllImport("advapi32.dll")] static extern void CredFree(IntPtr value);
 public static void Save(string target,string text) {
  var bytes=System.Text.Encoding.UTF8.GetBytes(text); if(bytes.Length>2400)throw new Exception("CREDENTIAL_TOO_LARGE");
  var ptr=Marshal.AllocHGlobal(bytes.Length);
  try {Marshal.Copy(bytes,0,ptr,bytes.Length);var c=new CREDENTIAL{Type=1,TargetName=target,CredentialBlobSize=(uint)bytes.Length,CredentialBlob=ptr,Persist=2,UserName="website-verification"};if(!Write(ref c,0))throw new Win32Exception();}
  finally {for(int i=0;i<bytes.Length;i++)Marshal.WriteByte(ptr,i,0);Marshal.FreeHGlobal(ptr);Array.Clear(bytes,0,bytes.Length);}
 }
 public static string Load(string target) {
  IntPtr ptr;if(!Read(target,1,0,out ptr)){if(Marshal.GetLastWin32Error()==1168)return null;throw new Win32Exception();}
  try {var c=(CREDENTIAL)Marshal.PtrToStructure(ptr,typeof(CREDENTIAL));var bytes=new byte[c.CredentialBlobSize];Marshal.Copy(c.CredentialBlob,bytes,0,bytes.Length);try{return System.Text.Encoding.UTF8.GetString(bytes);}finally{Array.Clear(bytes,0,bytes.Length);}}
  finally {CredFree(ptr);}
 }
 public static void Remove(string target) {if(!Delete(target,1,0)&&Marshal.GetLastWin32Error()!=1168)throw new Win32Exception();}
}
'@
switch ($credentialRequest.operation) {
 'write' { [VerificationCredential]::Save($credentialRequest.target, $credentialRequest.value); [Console]::Write('{"ok":true}') }
 'read' { $credentialValue = [VerificationCredential]::Load($credentialRequest.target); @{ value = $credentialValue } | ConvertTo-Json -Compress | ForEach-Object { [Console]::Write($_) } }
 'delete' { [VerificationCredential]::Remove($credentialRequest.target); [Console]::Write('{"ok":true}') }
 default { throw 'INVALID_CREDENTIAL_OPERATION' }
}
