import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

export const buttonVariants = cva(
  'inline-flex min-h-10 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-brand text-white hover:bg-indigo-500',
        outline: 'border border-outline bg-panel text-ink hover:bg-[#222435]',
        danger: 'bg-red-700 text-white hover:bg-red-600',
      },
    },
    defaultVariants: { variant: 'default' },
  },
)

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, type = 'button', ...props }, ref) => (
    <button ref={ref} type={type} className={cn(buttonVariants({ variant }), className)} {...props} />
  ),
)
Button.displayName = 'Button'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => <input ref={ref} className={cn('field', className)} {...props} />,
)
Input.displayName = 'Input'

export function Badge({ children, tone = 'neutral' }: {
  children: React.ReactNode
  tone?: 'neutral' | 'good' | 'warn' | 'bad'
}) {
  return <span className={cn('badge', tone)}>{children}</span>
}
