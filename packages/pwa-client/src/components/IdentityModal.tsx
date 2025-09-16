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
import { Key, Copy, AlertCircle, CheckCircle } from 'lucide-react';

interface IdentityModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateNew: () => void;
  onImport: (nsec: string) => void;
  existingNpub?: string;
}

export const IdentityModal: React.FC<IdentityModalProps> = ({
  open,
  onOpenChange,
  onCreateNew,
  onImport,
  existingNpub,
}) => {
  const [nsecInput, setNsecInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'create' | 'import'>('create');

  const handleCreateNew = () => {
    onCreateNew();
    onOpenChange(false);
  };

  const handleImport = () => {
    if (!nsecInput.trim()) {
      setError('Please enter your nsec key');
      return;
    }

    if (!nsecInput.startsWith('nsec1')) {
      setError('Invalid nsec format - must start with nsec1');
      return;
    }

    try {
      onImport(nsecInput);
      onOpenChange(false);
      setNsecInput('');
      setError(null);
    } catch (err) {
      setError('Invalid nsec key - please check and try again');
    }
  };

  const copyNpub = async () => {
    if (existingNpub) {
      await navigator.clipboard.writeText(existingNpub);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // If user already has an identity, show it
  if (existingNpub) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Your Nostr Identity</DialogTitle>
            <DialogDescription>
              You're using this identity for all Peek communities
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Your Public Key (npub)</Label>
              <div className="flex gap-2">
                <Input
                  value={existingNpub}
                  readOnly
                  className="font-mono text-sm"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={copyNpub}
                >
                  {copied ? (
                    <CheckCircle className="h-4 w-4 text-green-600" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            <Alert>
              <Key className="h-4 w-4" />
              <AlertDescription>
                Your private key (nsec) is stored securely in your browser's localStorage.
                Make sure to back it up if you want to use the same identity on other devices.
              </AlertDescription>
            </Alert>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // New user - offer to create or import
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Setup Your Nostr Identity</DialogTitle>
          <DialogDescription>
            Create a new identity or import an existing one to join communities
          </DialogDescription>
        </DialogHeader>
        
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'create' | 'import')}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="create">Create New</TabsTrigger>
            <TabsTrigger value="import">Import Existing</TabsTrigger>
          </TabsList>
          
          <TabsContent value="create" className="space-y-4">
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                We'll create a new Nostr identity for you. This will be used to identify
                you across all Peek communities.
              </p>
              
              <Alert>
                <Key className="h-4 w-4" />
                <AlertDescription>
                  A new cryptographic key pair will be generated and stored securely 
                  in your browser. You'll be able to export it later for backup.
                </AlertDescription>
              </Alert>
            </div>
            
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateNew}>
                Create New Identity
              </Button>
            </DialogFooter>
          </TabsContent>
          
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
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={handleImport}>
                Import Identity
              </Button>
            </DialogFooter>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};