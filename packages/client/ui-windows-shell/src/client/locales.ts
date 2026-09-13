/** `settings.windows-shell` namespace dictionaries (the Windows Shell row's copy). */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'title': 'Windows Shell',
  'description': '选择 Windows 下默认使用的 Shell，重启后生效',
  'loading': '加载中',
  'shell.gitbash': 'Git Bash',
  'shell.pwsh': 'PowerShell',
} satisfies Record<string, string>

/** The settings.windows-shell namespace key union. */
export type WindowsShellSettingsKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'title': 'Windows Shell',
  'description': 'Choose the default shell on Windows; applies at the next launch',
  'loading': 'Loading',
  'shell.gitbash': 'Git Bash',
  'shell.pwsh': 'PowerShell',
} satisfies Record<WindowsShellSettingsKey, string>
