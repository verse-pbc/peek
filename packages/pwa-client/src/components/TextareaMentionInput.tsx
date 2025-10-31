import { useRef, useState, useEffect, KeyboardEvent, ChangeEvent } from 'react';
import { nip19 } from 'nostr-tools';
import { getDiceBearDataUrl } from '@/lib/dicebear';

interface MentionData {
  id: string;
  display: string;
  pubkey?: string;
}

interface TextareaMentionInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
  disabled?: boolean;
  mentionData: MentionData[];
  className?: string;
}

/**
 * Textarea-based mention input component for better iOS compatibility
 * Uses a real textarea with overlay rendering for mentions
 */
export function TextareaMentionInput({
  value,
  onChange,
  onSubmit,
  placeholder,
  disabled,
  mentionData,
  className = '',
}: TextareaMentionInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const suggestionListRef = useRef<HTMLDivElement>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestionFilter, setSuggestionFilter] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [displayValue, setDisplayValue] = useState('');

  // Convert nostr:npub to @username for display
  const getDisplayValue = (text: string): string => {
    return text.replace(
      /nostr:(npub[a-z0-9]{58})/g,
      (match, npub) => {
        try {
          const decoded = nip19.decode(npub);
          const pubkey = typeof decoded.data === 'string' ? decoded.data : '';
          if (!pubkey) return match;
          
          const mention = mentionData.find(m => m.pubkey === pubkey);
          const displayName = mention?.display || npub.slice(0, 12) + '...';
          return `@${displayName}`;
        } catch {
          return match;
        }
      }
    );
  };

  // Convert @username back to nostr:npub for storage
  const getRawValue = (displayText: string): string => {
    let result = displayText;
    // Try to replace @username with nostr:npub if found
    mentionData.forEach(mention => {
      const displayName = mention.display;
      const regex = new RegExp(`@${displayName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g');
      result = result.replace(regex, `nostr:${mention.id}`);
    });
    return result;
  };

  // Update display value when actual value changes
  useEffect(() => {
    setDisplayValue(getDisplayValue(value));
  }, [value, mentionData, getDisplayValue]);

  // Handle input changes
  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const newDisplayValue = e.target.value;
    const cursor = e.target.selectionStart || 0;
    
    setDisplayValue(newDisplayValue);
    
    // Convert display value back to raw value for storage
    const rawValue = getRawValue(newDisplayValue);
    onChange(rawValue);
    
    // Check for @ trigger
    const textBeforeCursor = newDisplayValue.slice(0, cursor);
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');
    
    if (lastAtIndex !== -1) {
      const textAfterAt = textBeforeCursor.slice(lastAtIndex + 1);
      const charBeforeAt = textBeforeCursor[lastAtIndex - 1];
      
      // Only show suggestions if @ is at start or after whitespace and no spaces after @
      if ((!charBeforeAt || /\s/.test(charBeforeAt)) && !/\s/.test(textAfterAt)) {
        setSuggestionFilter(textAfterAt.toLowerCase());
        setShowSuggestions(true);
        setSelectedIndex(0);
        return;
      }
    }
    
    setShowSuggestions(false);
  };

  // Scroll selected item into view
  const scrollToSelectedItem = (index: number) => {
    setTimeout(() => {
      if (suggestionListRef.current) {
        const items = suggestionListRef.current.querySelectorAll('[data-suggestion-item]');
        const selectedItem = items[index] as HTMLElement;
        if (selectedItem) {
          selectedItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
      }
    }, 0);
  };

  // Handle key down
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (showSuggestions) {
      const filtered = mentionData.filter(m =>
        m.display.toLowerCase().includes(suggestionFilter)
      );
      
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const newIndex = Math.min(selectedIndex + 1, filtered.length - 1);
        setSelectedIndex(newIndex);
        scrollToSelectedItem(newIndex);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const newIndex = Math.max(selectedIndex - 1, 0);
        setSelectedIndex(newIndex);
        scrollToSelectedItem(newIndex);
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        if (filtered[selectedIndex]) {
          insertMention(filtered[selectedIndex]);
        }
      } else if (e.key === 'Escape') {
        setShowSuggestions(false);
      }
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSubmit?.();
    }
  };

  // Insert a mention at cursor position
  const insertMention = (mention: MentionData) => {
    if (!textareaRef.current) return;
    
    const textarea = textareaRef.current;
    const cursor = textarea.selectionStart || 0;
    const textBeforeCursor = displayValue.slice(0, cursor);
    const textAfterCursor = displayValue.slice(cursor);
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');
    
    if (lastAtIndex !== -1) {
      // Replace from @ to cursor with @username in display
      const beforeAt = displayValue.slice(0, lastAtIndex);
      const mentionDisplayText = `@${mention.display}`;
      const newDisplayValue = beforeAt + mentionDisplayText + ' ' + textAfterCursor;
      const newCursorPos = beforeAt.length + mentionDisplayText.length + 1;
      
      setDisplayValue(newDisplayValue);
      
      // Convert to raw value with nostr:npub
      const rawValue = getRawValue(newDisplayValue);
      onChange(rawValue);
      
      setShowSuggestions(false);
      setSuggestionFilter('');
      
      // Set cursor position after mention
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.selectionStart = newCursorPos;
          textareaRef.current.selectionEnd = newCursorPos;
          textareaRef.current.focus();
        }
      }, 0);
    }
  };

  const filteredSuggestions = mentionData.filter(m =>
    m.display.toLowerCase().includes(suggestionFilter)
  );

  return (
    <div className="relative w-full min-w-0">
      <textarea
        ref={textareaRef}
        value={displayValue}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        rows={1}
        className={`
          w-full min-h-[40px] max-h-[120px] resize-none overflow-y-auto styled-scrollbar
          px-3 py-2 text-sm rounded-md border border-input bg-background
          focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2
          disabled:cursor-not-allowed disabled:opacity-50
          ${className}
        `}
        style={{
          direction: 'ltr',
          textAlign: 'left',
        }}
      />
      
      {/* Suggestions popup */}
      {showSuggestions && filteredSuggestions.length > 0 && (
        <div className="absolute bottom-full left-0 mb-2 w-full max-w-sm bg-popover border border-border rounded-lg shadow-lg overflow-hidden z-50">
          <div ref={suggestionListRef} className="max-h-60 overflow-y-auto styled-scrollbar">
            {filteredSuggestions.slice(0, 10).map((mention, index) => (
              <div
                key={mention.id}
                data-suggestion-item
                onMouseDown={(e) => {
                  e.preventDefault();
                  insertMention(mention);
                }}
                onMouseEnter={() => setSelectedIndex(index)}
                className={`
                  flex items-center gap-2 px-3 py-2 cursor-pointer
                  ${index === selectedIndex ? 'bg-accent' : 'hover:bg-accent/50'}
                `}
              >
                <span className="font-medium flex-1">{mention.display}</span>
                {mention.pubkey && (
                  <img
                    src={getDiceBearDataUrl(mention.pubkey, 32)}
                    alt=""
                    className="w-6 h-6 rounded-full flex-shrink-0"
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      
      <style>{`
        .styled-scrollbar {
          scrollbar-width: thin;
          scrollbar-color: hsl(var(--border)) transparent;
        }
        
        .styled-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        
        .styled-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        
        .styled-scrollbar::-webkit-scrollbar-thumb {
          background-color: hsl(var(--border));
          border-radius: 3px;
        }
        
        .styled-scrollbar::-webkit-scrollbar-thumb:hover {
          background-color: hsl(var(--border) / 0.8);
        }
      `}</style>
    </div>
  );
}
