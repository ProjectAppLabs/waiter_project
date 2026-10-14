import * as core from '@/lib/services/core/pos'

export async function requestCode(login: string): Promise<void> {
  await core.requestCode(login.trim())
}

export async function activate(login: string, code: string, password: string): Promise<boolean> {
  return (await core.activate(login.trim(), code.trim(), password)).ok
}
