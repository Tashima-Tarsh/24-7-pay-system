import { AuthForm } from '@/components/auth-form'

export const dynamic = 'force-dynamic'

export default function AuthPage() {
  return <AuthForm registration={false} captchaKey={process.env.CAPTCHA_SITE_KEY || ''} />
}
