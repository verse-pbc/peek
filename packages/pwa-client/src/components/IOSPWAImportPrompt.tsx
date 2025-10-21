/**
 * iOS PWA Import Prompt
 *
 * Shows on PWA first launch when no identity exists.
 * Explains iOS limitation and guides user to import from Safari.
 */

import React, { useState } from 'react'
import { Alert, AlertDescription } from './ui/alert'
import { Button } from './ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Textarea } from './ui/textarea'
import { AlertCircle, Download } from 'lucide-react'
import { useNostrLogin } from '@/lib/nostrify-shim'
import { useToast } from '@/hooks/useToast'
import { requestNotificationPermission } from '@/services/push'

export function IOSPWAImportPrompt() {
  const { importIdentity } = useNostrLogin()
  const { toast } = useToast()
  const [nsecInput, setNsecInput] = useState('')
  const [importing, setImporting] = useState(false)

  const handleImport = async () => {
    if (!nsecInput.trim()) {
      toast({
        title: 'No Key Provided',
        description: 'Please paste your secret key',
        variant: 'destructive'
      })
      return
    }

    setImporting(true)
    try {
      await importIdentity(nsecInput.trim())

      // Auto-request push notification permission for PWA
      try {
        const permission = await requestNotificationPermission()
        if (permission === 'granted') {
          toast({
            title: 'Account Connected!',
            description: 'Communities and notifications enabled'
          })
          console.log('[PWA Import] Push permission granted, will auto-register on reload')
        } else {
          toast({
            title: 'Account Connected!',
            description: 'Enable notifications in settings for alerts'
          })
        }
      } catch (e) {
        toast({
          title: 'Account Connected!',
          description: 'Your communities are now synced'
        })
        console.warn('[PWA Import] Failed to request push permission:', e)
      }

      // Reload to show communities and trigger auto-push registration
      setTimeout(() => window.location.href = '/', 1500)
    } catch (error) {
      toast({
        title: 'Import Failed',
        description: error instanceof Error ? error.message : 'Invalid secret key format',
        variant: 'destructive'
      })
      setImporting(false)
    }
  }

  const handleContinueFresh = () => {
    // Warn user about consequences
    const confirmed = window.confirm(
      "⚠️ Warning: Creating a new identity here means:\n\n" +
      "• QR codes will open in Safari with a DIFFERENT identity\n" +
      "• Communities won't sync between Safari and this app\n" +
      "• Push notifications won't work for Safari communities\n\n" +
      "Recommended: Import your Safari identity instead.\n\n" +
      "Continue anyway?"
    )

    if (confirmed) {
      // Force page reload to create anonymous identity
      localStorage.removeItem('peek_nostr_identity')
      window.location.href = '/'
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            Connect Your Account
          </CardTitle>
          <CardDescription>
            One-time setup for Peek homescreen app
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert className="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
            <AlertCircle className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <AlertDescription className="text-sm text-blue-800 dark:text-blue-200">
              Connect your Safari account to sync communities and enable notifications in this app.
            </AlertDescription>
          </Alert>

          <div className="space-y-2">
            <h3 className="font-medium text-sm">How to connect:</h3>
            <ol className="text-sm space-y-1.5 text-muted-foreground list-decimal list-inside">
              <li>Open Peek in <strong>Safari browser</strong></li>
              <li>Go to "My Communities" (tap back ← if in a community)</li>
              <li>Tap your <strong>avatar</strong> (top right corner)</li>
              <li>Select <strong>"Profile & Keys"</strong></li>
              <li>Go to <strong>"Your Keys"</strong> tab</li>
              <li>Tap <strong>"Copy Secret Key"</strong></li>
              <li>Return here and paste below</li>
            </ol>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Paste your key here:</label>
            <Textarea
              placeholder="nsec1..."
              value={nsecInput}
              onChange={(e) => setNsecInput(e.target.value)}
              className="font-mono text-xs"
              rows={2}
            />
            <p className="text-xs text-muted-foreground">
              Your key is stored securely on this device only.
            </p>
          </div>

          <div className="space-y-2">
            <Button
              onClick={handleImport}
              disabled={importing || !nsecInput.trim()}
              className="w-full"
            >
              {importing ? 'Connecting...' : 'Connect Account'}
            </Button>

            <Button
              onClick={handleContinueFresh}
              variant="ghost"
              size="sm"
              className="w-full text-xs text-muted-foreground"
            >
              I don't have a Safari account
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
