import { ThemeToggle } from "@/components/theme-toggle"
import { UserIdentityButton } from "@/components/UserIdentityButton"

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen">
      {children}
      <div className="fixed top-4 right-4 z-50">
        <UserIdentityButton />
      </div>
      <div className="fixed bottom-4 right-4 z-50">
        <ThemeToggle />
      </div>
    </div>
  )
}