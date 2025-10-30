import { useTranslation } from 'react-i18next';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from './ui/select';
import { Globe } from 'lucide-react';

const languages = [
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'es', name: 'Spanish', nativeName: 'Español' },
];

export const LanguageSelector = () => {
  const { i18n } = useTranslation();

  const handleLanguageChange = (languageCode: string) => {
    i18n.changeLanguage(languageCode);
  };

  // Get current language info, fallback to first language if not found
  const currentLang = languages.find(lang => lang.code === i18n.language) || languages[0];

  return (
    <Select value={i18n.language} onValueChange={handleLanguageChange}>
      <SelectTrigger className="h-9 w-9 sm:w-auto sm:px-3 border border-input bg-background hover:bg-accent hover:text-accent-foreground focus:ring-0 focus:ring-offset-0 [&>svg]:hidden p-0 sm:p-2 justify-center">
        <div className="flex items-center justify-center gap-2 w-full">
          <Globe className="h-4 w-4 flex-shrink-0" />
          <span className="hidden sm:inline truncate">{currentLang.nativeName}</span>
        </div>
      </SelectTrigger>
      <SelectContent>
        {languages.map((lang) => (
          <SelectItem key={lang.code} value={lang.code}>
            {lang.nativeName}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};
