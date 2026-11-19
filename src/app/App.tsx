import { RouterProvider } from '@tanstack/react-router'
import { TooltipProvider } from '@/ui/Tooltip'
import { router } from './router'

export function App() {
  return (
    <TooltipProvider>
      <RouterProvider router={router} />
    </TooltipProvider>
  )
}
