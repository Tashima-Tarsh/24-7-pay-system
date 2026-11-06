'use client'

import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'

export function Modal({ open, onOpenChange, title, description, children }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/70" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[90dvh] w-[min(94vw,520px)] -translate-x-1/2 -translate-y-1/2 overflow-auto rounded-xl border border-outline bg-panel p-6 shadow-2xl">
          <Dialog.Title className="pr-8 text-xl font-semibold">{title}</Dialog.Title>
          <Dialog.Description className="mb-5 mt-2 text-sm text-muted">{description}</Dialog.Description>
          <Dialog.Close aria-label="Close dialog" className="absolute right-4 top-4 rounded p-2 text-muted hover:text-ink"><X size={18} /></Dialog.Close>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
