import { ThemeProvider } from 'next-themes'
import { ResetPasswordScreen } from '@/components/reset-password-screen'

interface ResetPasswordPageProps {
  params: Promise<{ token: string }>
}

export default async function ResetPasswordPage({ params }: ResetPasswordPageProps) {
  const { token } = await params

  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
      <ResetPasswordScreen token={decodeURIComponent(token)} />
    </ThemeProvider>
  )
}
