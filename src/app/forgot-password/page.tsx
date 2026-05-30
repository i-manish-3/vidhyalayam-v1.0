import { ThemeProvider } from 'next-themes'
import { ForgotPasswordScreen } from '@/components/forgot-password-screen'

export default function ForgotPasswordPage() {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
      <ForgotPasswordScreen />
    </ThemeProvider>
  )
}
