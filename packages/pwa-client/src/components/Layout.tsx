import { useLocation } from "react-router-dom"
import { ThemeToggle } from "@/components/theme-toggle"
import { UserIdentityButton } from "@/components/UserIdentityButton"

export function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  // Never show identity button on /c/ pages (scan/join pages)
  const showIdentityButton = !location.pathname.startsWith('/c/');

  return (
    <div className="relative min-h-screen">
      {children}
      {showIdentityButton && (
        <div className="fixed top-4 right-4 z-50">
          <UserIdentityButton />
        </div>
      )}
      <div className="fixed bottom-4 right-4 z-50">
        <ThemeToggle />
      </div>
    </div>
  )
}