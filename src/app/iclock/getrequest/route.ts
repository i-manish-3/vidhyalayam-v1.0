import { zktecoOk } from '@/lib/zkteco-adms'

export const runtime = 'nodejs'

export async function GET() {
  return zktecoOk('OK')
}
