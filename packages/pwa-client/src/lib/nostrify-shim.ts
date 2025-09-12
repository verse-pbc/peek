// Temporary shim for Nostrify until we properly configure JSR packages
import React from 'react';

export const NostrContext = React.createContext<any>({});

export const NostrLoginProvider: React.FC<{ 
  children: React.ReactNode;
  storageKey?: string;
}> = ({ children }) => {
  return React.createElement(React.Fragment, null, children);
};

// Mock types for now
export interface NostrEvent {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig: string;
}

export class NPool {
  constructor(config: any) {}
  req(filters: any[]): AsyncIterable<any> {
    return {
      async *[Symbol.asyncIterator]() {
        // Mock implementation
      }
    };
  }
}

export class NRelay1 {
  constructor(url: string) {}
}