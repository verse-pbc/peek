import { useRef, useEffect, useState, KeyboardEvent } from 'react';
import { nip19 } from 'nostr-tools';
import { getDiceBearDataUrl } from '@/lib/dicebear';

interface MentionData {
  id: string;
  display: string;
  pubkey?: string;
}

interface ContentEditableMentionInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
  disabled?: boolean;
  mentionData: MentionData[];
  className?: string;
}

/**
 * Custom contentEditable-based mention input component
 * Replaces react-mentions with a native implementation that:
 * - Parses nostr:npub mentions and displays them as styled @username spans
 * - Shows autocomplete suggestions when typing @
 * - Supports keyboard navigation (arrow keys, enter, escape)
 * - Handles form submission (enter key)
 * - Properly serializes content back to nostr:npub format
 */
export function ContentEditableMentionInput({
  value,
  onChange,
  onSubmit,
  placeholder,
  disabled,
  mentionData,
  className = '',
}: ContentEditableMentionInputProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const suggestionListRef = useRef<HTMLDivElement>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestionFilter, setSuggestionFilter] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [cursorPosition, setCursorPosition] = useState(0);

  // Parse nostr:npub mentions and convert to display format with spans
  const parseContent = (text: string): string => {
    // Replace nostr:npub... with span elements containing data attributes
    return text.replace(
      /nostr:(npub[a-z0-9]{58})/g,
      (match, npub) => {
        try {
          const decoded = nip19.decode(npub);
          // decoded.data is string for npub type
          const pubkey = typeof decoded.data === 'string' ? decoded.data : '';
          if (!pubkey) return match;
          
          // Find display name from mentionData
          const mention = mentionData.find(m => m.pubkey === pubkey);
          const displayName = mention?.display || npub.slice(0, 12) + '...';
          
          return `<span class="mention" contenteditable="false" data-npub="${npub}" data-pubkey="${pubkey}">@${displayName}</span>`;
        } catch (e) {
          console.error('Failed to decode npub:', e);
          return match;
        }
      }
    );
  };

  // Serialize HTML back to nostr:npub format
  const serializeContent = (): string => {
    if (!editorRef.current) return '';
    
    const html = editorRef.current.innerHTML;
    const temp = document.createElement('div');
    temp.innerHTML = html;
    
    // Replace mention spans with nostr:npub format
    const mentions = temp.querySelectorAll('span.mention');
    mentions.forEach(mention => {
      const npub = mention.getAttribute('data-npub');
      if (npub) {
        const textNode = document.createTextNode(`nostr:${npub}`);
        mention.parentNode?.replaceChild(textNode, mention);
      }
    });
    
    // Get text content and clean up
    let text = temp.textContent || '';
    // Remove zero-width spaces and normalize whitespace
    text = text.replace(/\u200B/g, '').trim();
    
    return text;
  };

  // Update editor content when value changes externally
  useEffect(() => {
    if (!editorRef.current) return;
    
    const currentSerialized = serializeContent();
    if (currentSerialized !== value) {
      const parsed = parseContent(value);
      editorRef.current.innerHTML = parsed || '<br>';
    }
  }, [value, mentionData]);

  // Handle input changes
  const handleInput = () => {
    const serialized = serializeContent();
    onChange(serialized);
    
    // Check for @ trigger
    if (editorRef.current) {
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        const node = range.startContainer;
        
        // Don't show suggestions if cursor is inside or after a mention span
        let currentNode: Node | null = node;
        while (currentNode) {
          if (currentNode.nodeType === Node.ELEMENT_NODE) {
            const element = currentNode as HTMLElement;
            if (element.classList?.contains('mention')) {
              setShowSuggestions(false);
              return;
            }
          }
          currentNode = currentNode.parentNode;
        }
        
        // Only check text nodes, not mention spans
        if (node.nodeType === Node.TEXT_NODE) {
          const textBeforeCursor = node.textContent?.slice(0, range.startOffset) || '';
          const lastAtIndex = textBeforeCursor.lastIndexOf('@');
          
          if (lastAtIndex !== -1) {
            const textAfterAt = textBeforeCursor.slice(lastAtIndex + 1);
            // Only show suggestions if @ is at start or after whitespace and no spaces after @
            const charBeforeAt = textBeforeCursor[lastAtIndex - 1];
            if ((!charBeforeAt || /\s/.test(charBeforeAt)) && !/\s/.test(textAfterAt)) {
              setSuggestionFilter(textAfterAt.toLowerCase());
              setShowSuggestions(true);
              setSelectedIndex(0);
              return;
            }
          }
        }
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
  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
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
    if (!editorRef.current) return;
    
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    
    const range = selection.getRangeAt(0);
    const textNode = range.startContainer;
    const cursorPos = range.startOffset;
    const textBeforeCursor = textNode.textContent?.slice(0, cursorPos) || '';
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');
    
    if (lastAtIndex !== -1) {
      // Delete from @ to cursor (including the @ and any filter text)
      const deleteRange = document.createRange();
      deleteRange.setStart(textNode, lastAtIndex);
      deleteRange.setEnd(textNode, cursorPos);
      deleteRange.deleteContents();
      
      // Create mention span
      const mentionSpan = document.createElement('span');
      mentionSpan.className = 'mention';
      mentionSpan.contentEditable = 'false';
      mentionSpan.setAttribute('data-npub', mention.id);
      if (mention.pubkey) {
        mentionSpan.setAttribute('data-pubkey', mention.pubkey);
      }
      mentionSpan.textContent = `@${mention.display}`;
      
      // Insert mention at the deletion point
      const insertRange = document.createRange();
      insertRange.setStart(textNode, lastAtIndex);
      insertRange.insertNode(mentionSpan);
      
      // Add non-breaking space after mention
      const space = document.createTextNode('\u00A0');
      mentionSpan.parentNode?.insertBefore(space, mentionSpan.nextSibling);
      
      // Move cursor after space
      const newRange = document.createRange();
      newRange.setStartAfter(space);
      newRange.collapse(true);
      selection.removeAllRanges();
      selection.addRange(newRange);
      
      // Close suggestions and trigger onChange
      setShowSuggestions(false);
      setSuggestionFilter('');
      
      // Trigger input event to update value
      setTimeout(() => {
        handleInput();
        editorRef.current?.focus();
      }, 0);
    }
  };

  const filteredSuggestions = mentionData.filter(m =>
    m.display.toLowerCase().includes(suggestionFilter)
  );

  return (
    <div className="relative flex-1">
      <div
        ref={editorRef}
        contentEditable={!disabled}
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        dangerouslySetInnerHTML={{ __html: parseContent(value) }}
        className={`
          min-h-[40px] max-h-[120px] overflow-y-auto styled-scrollbar
          px-3 py-2 text-sm rounded-md border border-input bg-background
          focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2
          disabled:cursor-not-allowed disabled:opacity-50
          ${className}
        `}
        data-placeholder={placeholder}
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
                  e.preventDefault(); // Prevent blur
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
        [contenteditable][data-placeholder]:empty:before {
          content: attr(data-placeholder);
          color: hsl(var(--muted-foreground));
          pointer-events: none;
        }
        
        .mention {
          display: inline-block;
          padding: 0 4px;
          margin: 0 1px;
          background-color: hsl(var(--accent) / 0.5);
          border-radius: 4px;
          color: hsl(var(--accent-foreground));
          font-weight: 500;
          cursor: default;
          user-select: none;
        }
        
        .mention:hover {
          background-color: hsl(var(--accent) / 0.7);
        }
        
        /* Styled scrollbar */
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
