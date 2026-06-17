'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import AddTransactionForm from './AddTransactionForm'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'

export default function AddTransactionModal() {
  const [open, setOpen] = useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="flex items-center gap-2 bg-black hover:bg-gray-800 text-white">
          <Plus className="h-4 w-4" />
          Add Transaction
        </Button>
      </DialogTrigger>

      <DialogContent 
        className="sm:max-w-[520px] bg-white shadow-xl rounded-xl p-6 border border-gray-200 ring-0"
        aria-describedby={undefined}
      >
        <DialogHeader>
          <DialogTitle className="text-xl">Add New Transaction</DialogTitle>
        </DialogHeader>

        <AddTransactionForm onSuccess={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  )
}