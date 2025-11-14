import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Button } from './ui/button';
import { Shield, X } from 'lucide-react';
import { KeycastAccountModal } from './KeycastAccountModal';
import { IdentityModal } from './IdentityModal';
import { useTranslation } from 'react-i18next';
import { markPWAPromptShown } from '@/lib/pwa-detection';

interface PWALoginPromptProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const PWALoginPrompt: React.FC<PWALoginPromptProps> = ({
  open,
  onOpenChange,
}) => {
  const { t } = useTranslation();
  const [showKeycastModal, setShowKeycastModal] = useState(false);
  const [showAdvancedModal, setShowAdvancedModal] = useState(false);

  const handleClose = () => {
    markPWAPromptShown();
    onOpenChange(false);
  };

  const handleKeycast = () => {
    handleClose();
    setShowKeycastModal(true);
  };

  const handleAdvanced = () => {
    handleClose();
    setShowAdvancedModal(true);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl">
              {t('pwa_login.title')}
            </DialogTitle>
            <DialogDescription>
              {t('pwa_login.description')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-4">
            {/* Primary CTA: Keycast Login */}
            <Button
              onClick={handleKeycast}
              className="w-full h-auto py-4"
              size="lg"
            >
              <Shield className="mr-2 h-5 w-5" />
              <div className="text-left">
                <div className="font-semibold">{t('pwa_login.login_keycast')}</div>
                <div className="text-xs font-normal opacity-90">{t('pwa_login.login_keycast_desc')}</div>
              </div>
            </Button>

            {/* Advanced Option */}
            <Button
              onClick={handleAdvanced}
              variant="ghost"
              className="w-full"
              size="sm"
            >
              {t('pwa_login.advanced_option')}
            </Button>

            {/* Skip Option */}
            <div className="text-center">
              <button
                onClick={handleClose}
                className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
              >
                <X className="h-3 w-3" />
                {t('pwa_login.skip')}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Keycast Modal */}
      {showKeycastModal && (
        <KeycastAccountModal
          open={showKeycastModal}
          onOpenChange={setShowKeycastModal}
        />
      )}

      {/* Advanced Identity Modal (for bunker URL import) */}
      {showAdvancedModal && (
        <IdentityModal
          open={showAdvancedModal}
          onOpenChange={setShowAdvancedModal}
          mode="switch"
        />
      )}
    </>
  );
};
