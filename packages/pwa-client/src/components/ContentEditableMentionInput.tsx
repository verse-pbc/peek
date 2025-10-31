import { useRef, useEffect, useState, useCallback } from 'react';
import { nip19 } from 'nostr-tools';
import { getDiceBearDataUrl } from '@/lib/dicebear';
import { cn } from '@/lib/utils';

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
 * 
 * iOS Safari Fixes:
 * - Removed dangerouslySetInnerHTML to prevent render interference
 * - MutationObserver to enforce LTR direction consistently
 * - Proper touch event handling and cursor management
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
  const isComposingRef = useRef(false);
  const lastRenderedValueRef = useRef<string>('');
  const isInitialMountRef = useRef(true);

  // Filter suggestions based on input
  const filteredSuggestions = mentionData.filter(m =>
    m.display.toLowerCase().includes(suggestionFilter.toLowerCase())
  );

  // Force LTR direction on element
  const forceLTR = useCallback((element: HTMLElement) => {
    if (!element) return;
    element.style.direction = 'ltr';
    element.style.textAlign = 'left';
    element.style.unicodeBidi = 'plaintext';
    element.setAttribute('dir', 'ltr');
  }, []);

  // Parse content to display mentions as styled spans
  const parseContent = useCallback((text: string): string => {
    if (!text) return '';
    
    return text.replace(
      /nostr:(npub[a-z0-9]{58,60})/gi,
      (match, npub) => {
        try {
          const decoded = nip19.decode(npub) as { type: string; data: string | object };
          if (decoded.type !== 'npub' || typeof decoded.data !== 'string') return match;
          const pubkey = decoded.data;
          if (!pubkey) return match;
          
          const mention = mentionData.find(m => m.pubkey === pubkey);
          const displayName = mention?.display || npub.slice(0, 12) + '...';

          return `<span class="mention" contenteditable="false" data-npub="${npub}" data-pubkey="${pubkey}" dir="ltr">@${displayName}</span>`;
        } catch (e) {
          console.error('Failed to decode npub:', e);
          return match;
        }
      }
    );
  }, [mentionData]);

  // Serialize content back to plain text with nostr:npub format
  const serializeContent = useCallback((): string => {
    if (!editorRef.current) return '';

    const temp = document.createElement('div');
    temp.innerHTML = editorRef.current.innerHTML;

    const mentions = temp.querySelectorAll('.mention');
    mentions.forEach(mention => {
      const npub = mention.getAttribute('data-npub');
      if (npub) {
        const textNode = document.createTextNode(`nostr:${npub} `);
        mention.parentNode?.replaceChild(textNode, mention);
      }
    });

    let text = temp.textContent || '';
    text = text.replace(/\s+/g, ' ').trim();
    return text;
  }, []);

  // Handle input events
  const handleInput = useCallback(() => {
    if (!editorRef.current) return;

    // Force LTR direction
    forceLTR(editorRef.current);

    const text = editorRef.current.textContent || '';
    const lastAt = text.lastIndexOf('@');

    if (lastAt !== -1) {
      const textAfterAt = text.slice(lastAt + 1);
      const charBeforeAt = lastAt > 0 ? text[lastAt - 1] : '';
      
      if ((!charBeforeAt || /\s/.test(charBeforeAt)) && !/\s/.test(textAfterAt)) {
        const filterText = textAfterAt.split(/\s/)[0];
        setSuggestionFilter(filterText);
        setShowSuggestions(true);
        setSelectedIndex(0);
      } else {
        setShowSuggestions(false);
        setSuggestionFilter('');
      }
    } else {
      setShowSuggestions(false);
      setSuggestionFilter('');
    }

    const newValue = serializeContent();
    lastRenderedValueRef.current = newValue;
    onChange(newValue);
  }, [onChange, serializeContent, forceLTR]);

  // Handle composition events (for IME input on mobile)
  const handleCompositionStart = useCallback(() => {
    isComposingRef.current = true;
  }, []);

  const handleCompositionEnd = useCallback(() => {
    isComposingRef.current = false;
    if (editorRef.current) {
      forceLTR(editorRef.current);
      const inputEvent = new Event('input', { bubbles: true });
      editorRef.current.dispatchEvent(inputEvent);
    }
  }, [forceLTR]);

  // Handle paste events
  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!editorRef.current) return;

    const text = e.clipboardData.getData('text/plain');
    if (!text) return;

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    range.deleteContents();
    const textNode = document.createTextNode(text);
    range.insertNode(textNode);
    range.setStartAfter(textNode);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);

    forceLTR(editorRef.current);
    const inputEvent = new Event('input', { bubbles: true });
    editorRef.current.dispatchEvent(inputEvent);
  }, [forceLTR]);

  // Handle blur events
  const handleBlur = useCallback(() => {
    setTimeout(() => {
      setShowSuggestions(false);
    }, 200);
  }, []);

  // Handle focus events
  const handleFocus = useCallback(() => {
    if (!editorRef.current) return;
    forceLTR(editorRef.current);

    requestAnimationFrame(() => {
      if (!editorRef.current) return;
      const range = document.createRange();
      const selection = window.getSelection();
      if (!selection) return;

      range.selectNodeContents(editorRef.current);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
    });
  }, [forceLTR]);

  // Scroll selected suggestion into view
  const scrollToSelectedItem = useCallback((index: number) => {
    setTimeout(() => {
      if (suggestionListRef.current) {
        const items = suggestionListRef.current.querySelectorAll('[data-suggestion-item]');
        const selectedItem = items[index] as HTMLElement;
        if (selectedItem) {
          selectedItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
      }
    }, 0);
  }, []);

  // Handle keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (isComposingRef.current) return;

    if (showSuggestions) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const newIndex = Math.min(selectedIndex + 1, filteredSuggestions.length - 1);
        setSelectedIndex(newIndex);
        scrollToSelectedItem(newIndex);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const newIndex = Math.max(selectedIndex - 1, 0);
        setSelectedIndex(newIndex);
        scrollToSelectedItem(newIndex);
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        if (filteredSuggestions[selectedIndex]) {
          insertMention(filteredSuggestions[selectedIndex]);
        }
      } else if (e.key === 'Escape') {
        setShowSuggestions(false);
      }
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSubmit?.();
    }
  }, [showSuggestions, selectedIndex, filteredSuggestions, onSubmit, scrollToSelectedItem]);

  // Insert a mention at the cursor position
  const insertMention = useCallback((mention: MentionData) => {
    if (!editorRef.current) return;

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    const textNode = range.startContainer;
    const cursorPos = range.startOffset;
    const textBeforeCursor = textNode.textContent?.slice(0, cursorPos) || '';
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');

    if (lastAtIndex !== -1) {
      const deleteRange = document.createRange();
      deleteRange.setStart(textNode, lastAtIndex);
      deleteRange.setEnd(textNode, cursorPos);
      deleteRange.deleteContents();

      const mentionSpan = document.createElement('span');
      mentionSpan.className = 'mention';
      mentionSpan.contentEditable = 'false';
      mentionSpan.setAttribute('data-npub', mention.id);
      mentionSpan.setAttribute('dir', 'ltr');
      if (mention.pubkey) {
        mentionSpan.setAttribute('data-pubkey', mention.pubkey);
      }
      mentionSpan.textContent = `@${mention.display}`;

      const insertRange = document.createRange();
      insertRange.setStart(textNode, lastAtIndex);
      insertRange.insertNode(mentionSpan);

      const space = document.createTextNode(' ');
      mentionSpan.parentNode?.insertBefore(space, mentionSpan.nextSibling);

      const newRange = document.createRange();
      newRange.setStartAfter(space);
      newRange.collapse(true);
      selection.removeAllRanges();
      selection.addRange(newRange);

      forceLTR(editorRef.current);
      setShowSuggestions(false);
      setSuggestionFilter('');

      requestAnimationFrame(() => {
        const inputEvent = new Event('input', { bubbles: true });
        editorRef.current?.dispatchEvent(inputEvent);
      });
    }
  }, [forceLTR]);

  // Initialize contentEditable content on mount
  useEffect(() => {
    if (!editorRef.current || !isInitialMountRef.current) return;
    isInitialMountRef.current = false;
    
    const parsed = parseContent(value);
    editorRef.current.innerHTML = parsed || '<br>';
    lastRenderedValueRef.current = value;
    forceLTR(editorRef.current);
  }, [value, parseContent, forceLTR]);
  
  // Update editor content when value changes externally
  useEffect(() => {
    if (!editorRef.current || value === lastRenderedValueRef.current) return;
    
    const currentSerialized = serializeContent();
    const normalizedCurrent = currentSerialized.trim().replace(/\s+/g, ' ');
    const normalizedValue = value.trim().replace(/\s+/g, ' ');
    
    if (normalizedCurrent !== normalizedValue) {
      const parsed = parseContent(value);
      editorRef.current.innerHTML = parsed || '<br>';
      lastRenderedValueRef.current = value;
      forceLTR(editorRef.current);
      
      requestAnimationFrame(() => {
        if (!editorRef.current) return;
        const range = document.createRange();
        const selection = window.getSelection();
        if (!selection) return;
        
        range.selectNodeContents(editorRef.current);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
      });
    }
  }, [value, mentionData, parseContent, serializeContent, forceLTR]);

  // iOS LTR enforcement with MutationObserver
  useEffect(() => {
    if (!editorRef.current) return;
    const element = editorRef.current;

    forceLTR(element);

    const observer = new MutationObserver(() => {
      if (element.style.direction !== 'ltr' || element.getAttribute('dir') !== 'ltr') {
        forceLTR(element);
      }
    });

    observer.observe(element, {
      attributes: true,
      attributeFilter: ['dir', 'style'],
    });

    return () => observer.disconnect();
  }, [forceLTR]);

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (editorRef.current && !editorRef.current.contains(target) &&
          suggestionListRef.current && !suggestionListRef.current.contains(target)) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);

  return (
    <div className={`relative ${className}`}>
      <div
        ref={editorRef}
        className={cn(
          'min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background',
          'placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2',
          'focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed',
          'disabled:opacity-50 overflow-y-auto max-h-[200px]',
          'text-left',
          'selection:bg-primary/20 selection:text-primary-foreground',
          disabled && 'opacity-50 cursor-not-allowed'
        )}
        contentEditable={!disabled}
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onBlur={handleBlur}
        onFocus={handleFocus}
        onCompositionStart={handleCompositionStart}
        onCompositionEnd={handleCompositionEnd}
        data-placeholder={placeholder}
        dir="ltr"
        style={{
          direction: 'ltr',
          textAlign: 'left',
          unicodeBidi: 'plaintext',
          outline: 'none',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          overflowWrap: 'break-word',
          lineHeight: '1.5',
          minHeight: '60px',
          padding: '0.5rem 0.75rem',
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
                onTouchStart={(e) => {
                  e.preventDefault();
                  insertMention(mention);
                }}
                onMouseEnter={() => setSelectedIndex(index)}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 cursor-pointer',
                  index === selectedIndex ? 'bg-accent' : 'hover:bg-accent/50'
                )}
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
        
        [contenteditable] {
          direction: ltr !important;
          text-align: left !important;
          unicode-bidi: plaintext !important;
        }
        
        [contenteditable] * {
          direction: ltr !important;
          text-align: left !important;
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
          direction: ltr !important;
          text-align: left !important;
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
          height: 6px;
        }
        
        .styled-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        
        .styled-scrollbar::-webkit-scrollbar-thumb {
          background-color: hsl(var(--border));
          border-radius: 3px;
        }
      `}</style>
    </div>
  );
}
