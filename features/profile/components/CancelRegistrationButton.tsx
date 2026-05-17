'use client'

import { useState, useTransition } from 'react'
import { Modal } from '@/components/ui/modal'
import { cancelRegistrationAction } from '../actions'

export function CancelRegistrationButton() {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  const handleConfirm = () => {
    startTransition(async () => {
      await cancelRegistrationAction()
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[var(--danger)] underline"
      >
        полностью отмените
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Отмена регистрации"
        primary={{ label: pending ? '…' : 'Подтвердить', onClick: handleConfirm }}
        secondary={{ label: 'Назад', onClick: () => setOpen(false) }}
        danger
      >
        Вы уверены, что хотите полностью отменить начатую вами ранее регистрацию?
      </Modal>
    </>
  )
}
