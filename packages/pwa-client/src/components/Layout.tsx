import { useLocation } from "react-router-dom"
import { UserIdentityButton } from "@/components/UserIdentityButton"

export function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  // Hide identity button on home page and community pages
  const showIdentityButton = location.pathname !== '/' && !location.pathname.startsWith('/c/');

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