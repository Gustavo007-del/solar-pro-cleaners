'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from './button';

export function Modal({ title, description, open, onOpenChange, children }: {
  title: string; description?: string; open: boolean; onOpenChange: (open: boolean) => void; children: ReactNode;
}) {
  return <Dialog.Root open={open} onOpenChange={onOpenChange}>
    <Dialog.Portal>
      <Dialog.Overlay className="dialog-overlay" />
      <Dialog.Content className="dialog-content">
        <header className="dialog-heading">
          <div><Dialog.Title className="section-title">{title}</Dialog.Title>
            <Dialog.Description className={description ? 'muted' : 'sr-only'}>{description ?? title}</Dialog.Description></div>
          <Dialog.Close asChild><Button size="icon" variant="ghost" aria-label="Close dialog"><X size={18} /></Button></Dialog.Close>
        </header>
        {children}
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}

