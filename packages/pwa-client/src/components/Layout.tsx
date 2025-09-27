import { useLocation } from "react-router-dom"
import { UserIdentityButton } from "@/components/UserIdentityButton"

export function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  // Never show identity button on /c/ pages (scan/join pages) or home page (has its own)
  const showIdentityButton = !location.pathname.startsWith('/c/') && location.pathname !== '/';

  return (
    <div className="relative min-h-screen">
      {children}
      {showIdentityButton && (
        <div className="fixed top-4 right-4 z-50">
          <UserIdentityButton />
        </div>
      )}
    </div>
  )
}