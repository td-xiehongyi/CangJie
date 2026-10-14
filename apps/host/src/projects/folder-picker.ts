import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const execute=promisify(execFile);
// Fixed script: no path or webpage input is evaluated as PowerShell code.
const script=`[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false)
Add-Type @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public class FolderPickerDesktop {
  [DllImport("user32.dll")] static extern IntPtr GetThreadDesktop(uint threadId);
  [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
  [DllImport("user32.dll")] static extern IntPtr OpenInputDesktop(uint flags, bool inherit, uint access);
  [DllImport("user32.dll")] static extern bool CloseDesktop(IntPtr desktop);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern bool GetUserObjectInformation(IntPtr handle, int index, StringBuilder text, int count, out int needed);
  static string Name(IntPtr handle) { var text=new StringBuilder(256); int needed; return GetUserObjectInformation(handle,2,text,512,out needed)?text.ToString():""; }
  public static bool CanShow() {
    var input=OpenInputDesktop(0,false,1); if(input==IntPtr.Zero)return false;
    try { var current=Name(GetThreadDesktop(GetCurrentThreadId())); return current.Length>0&&current==Name(input); }
    finally { CloseDesktop(input); }
  }
}
'@
if(-not [FolderPickerDesktop]::CanShow()){throw 'Interactive desktop unavailable'}
Add-Type -AssemblyName System.Windows.Forms
$dialog=New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description='选择本机网站项目文件夹'
$dialog.ShowNewFolderButton=$false
$owner=New-Object System.Windows.Forms.Form
$owner.TopMost=$true
$owner.ShowInTaskbar=$false
$owner.StartPosition='CenterScreen'
$owner.Opacity=0
try {
  $owner.Show()
  $owner.Activate()
  if($dialog.ShowDialog($owner) -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::Write($dialog.SelectedPath) }
} finally { $dialog.Dispose(); $owner.Dispose() }`;
export async function pickProjectDirectory(signal?:AbortSignal):Promise<string|null>{
  if(process.platform!=='win32')throw new Error('FOLDER_PICKER_UNAVAILABLE');
  try{const result=await execute('powershell.exe',['-NoProfile','-NonInteractive','-STA','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{signal,windowsHide:true,timeout:120000,maxBuffer:32768,encoding:'utf8'});return result.stdout.trim()||null;}
  catch{if(signal?.aborted)return null;throw new Error('FOLDER_PICKER_UNAVAILABLE');}
}
