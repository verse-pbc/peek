import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Alert, AlertDescription } from './ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { AlertCircle, Zap } from 'lucide-react';

interface IdentityModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (nsec: string) => void;
  onExtension?: () => void;
  isUpgrade?: boolean;
}

export const IdentityModal: React.FC<IdentityModalProps> = ({
  open,
  onOpenChange,
  onImport,
  onExtension,
  isUpgrade,
}) => {
  const [nsecInput, setNsecInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'import' | 'extension'>('import');

  const handleImport = React.useCallback(() => {
    console.log('[IdentityModal] handleImport called with nsec:', nsecInput.substring(0, 10) + '...');

    if (!nsecInput.trim()) {
      setError('Please enter your nsec key');
      return;
    }

    if (!nsecInput.startsWith('nsec1')) {
      setError('Invalid nsec format - must start with nsec1');
      return;
    }

    try {
      console.log('[IdentityModal] Calling onImport with nsec:', nsecInput);
      onImport(nsecInput);
      console.log('[IdentityModal] onImport completed successfully');
      // Don't close modal or clear input here - let UserIdentityButton handle it after successful migration
    } catch (err) {
      console.error('[IdentityModal] onImport failed:', err);
      setError('Invalid nsec key - please check and try again');
    }
  }, [nsecInput, onImport]);

  const handleExtension = () => {
    if (onExtension) {
      onExtension();
      onOpenChange(false);
    }
  };

  // Offer to import or use extension
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{isUpgrade ? 'Upgrade to Personal Identity' : 'Choose Your Identity'}</DialogTitle>
          <DialogDescription>
            {isUpgrade
              ? 'Replace your anonymous identity with a personal one that you can use across all Nostr apps'
              : 'Import an existing identity or use a browser extension'
            }
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'import' | 'extension')}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="import">Import Identity</TabsTrigger>
            <TabsTrigger value="extension">Browser Extension</TabsTrigger>
          </TabsList>
          
          <TabsContent value="import" className="space-y-4">
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="nsec">Your Private Key (nsec)</Label>
                <Input
                  id="nsec"
                  type="password"
                  placeholder="nsec1..."
                  value={nsecInput}
                  onChange={(e) => {
                    setNsecInput(e.target.value);
                    setError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleImport();
                  }}
                />
              </div>
              
              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              
              <p className="text-sm text-muted-foreground">
                Import your existing Nostr private key to use the same identity
                you have on other Nostr apps.
              </p>
            </div>
            
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  console.log('[Button] Import Identity clicked, nsec:', nsecInput.substring(0, 10) + '...');

                  if (!nsecInput.trim()) {
                    setError('Please enter your nsec key');
                    return;
                  }

                  if (!nsecInput.startsWith('nsec1')) {
                    setError('Invalid nsec format - must start with nsec1');
                    return;
                  }

                  try {
                    console.log('[Button] Calling onImport directly...');
                    onImport(nsecInput);
                    console.log('[Button] onImport completed');
                  } catch (err) {
                    console.error('[Button] onImport error:', err);
                    setError('Invalid nsec key - please check and try again');
                  }
                }}
              >
                Import Identity
              </Button>
            </DialogFooter>
          </TabsContent>

          <TabsContent value="extension" className="space-y-4">
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Connect your Nostr browser extension (like Alby or nos2x) to use your existing identity without exposing your private key.
              </p>

              <Alert>
                <Zap className="h-4 w-4" />
                <AlertDescription>
                  Your browser extension will handle signing events securely. Your private key never leaves the extension.
                </AlertDescription>
              </Alert>

              {!window.nostr && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    No Nostr browser extension detected. Please install Alby, nos2x, or another NIP-07 compatible extension.
                  </AlertDescription>
                </Alert>
              )}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleExtension}
                disabled={!window.nostr || !onExtension}
              >
                <Zap className="mr-2 h-4 w-4" />
                Connect Extension
              </Button>
            </DialogFooter>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};